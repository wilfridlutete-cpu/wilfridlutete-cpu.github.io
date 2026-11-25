"""Préparer les couches avec Python, GDAL et Shapely 2."""
import json
import unicodedata
from zipfile import ZipFile
from collections import Counter
from datetime import datetime
from pathlib import Path

from osgeo import ogr
from shapely import from_wkb, make_valid
from shapely.geometry import mapping, shape, Point, LineString
from shapely.ops import orient, unary_union
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / 'scripts'
UNITS = {
    'Kasaï': 'dekese ilebo kamonia mweka luebo tshikapa',
}


def key(value):
    return ''.join(c for c in unicodedata.normalize('NFKD', value.lower()) if c.isascii() and c.isalnum())


def parts(geometry, kind):
    if geometry.is_empty:
        return []
    if geometry.geom_type == kind:
        return [orient(geometry) if kind == 'Polygon' else geometry]
    return [part for child in getattr(geometry, 'geoms', []) for part in parts(child, kind)]


def feature(geometry, props, kind='Polygon'):
    items = parts(geometry, kind)
    if not items:
        return None
    coordinates = [mapping(item)['coordinates'] for item in items]
    prefix = 'Multi' if len(items) > 1 else ''
    return {'type': 'Feature', 'geometry': {
        'type': prefix + kind, 'coordinates': coordinates if prefix else coordinates[0],
    }, 'properties': props}


def write(name, features):
    features = [f for f in features if f is not None]
    if not features:
        raise ValueError(f'Couche vide : {name}')
    for sequence, item in enumerate(features, 1):
        item['properties']['cle'] = sequence
    (ROOT / 'data' / (name + '.geojson')).write_text(json.dumps({
        'type': 'FeatureCollection', 'features': features,
    }, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(name, len(features))


def date(value):
    try:
        parsed = datetime.strptime(value.strip().replace('/', '-'), '%Y-%m-%d').date()
        return parsed.isoformat() if parsed.year > 1900 else None
    except (ValueError, AttributeError):
        return None


def geometry(record):
    return make_valid(from_wkb(bytes(record.GetGeometryRef().ExportToWkb())))


def main():
    ogr.UseExceptions()
    collection = json.loads((SOURCES / 'adm2-source.geojson').read_text(encoding='utf-8'))
    units = []
    for province, names in UNITS.items():
        matches = {}
        for item in collection['features']:
            label = item['properties']['shapeName']
            normalized = key(label)
            for name in names.split():
                if normalized in (name, 'villede' + name, name + 'ville', 'ville' + name, 'territoirede' + name):
                    matches.setdefault(name, []).append((item, label))
        if set(matches) != set(names.split()):
            raise ValueError(f'{province}: unités manquantes {set(names.split()) - set(matches)}')
        for name, records in matches.items():
            if len(records) != 1:
                raise ValueError(f'Unité ambiguë : {name}')
            item, label = records[0]
            units.append((make_valid(shape(item['geometry'])), {
                'nom': label, 'province': province, 'id': item['properties']['shapeID'],
            }))
    geometries = [geom for geom, _ in units]
    index = STRtree(geometries)
    mask = unary_union(geometries)
    write('unites', (feature(geom, props) for geom, props in units))
    write('provinces', (feature(unary_union([geom for geom, props in units if props['province'] == province]),
                                {'nom': province}) for province in UNITS))

    source = ogr.Open(str(ROOT.parent / 'PERIMETRE' / 'PERIMETRE.shp'))
    permits = []
    for record in source.GetLayer():
        if not record.GetGeometryRef():
            continue
        geom = geometry(record)
        fields = record.items()
        for i in index.query(geom, predicate='intersects'):
            unit_geom, unit = units[i]
            permits.append(feature(geom.intersection(unit_geom), {
                **unit, 'unite_id': unit['id'], 'id': record.GetFID(),
                'code': fields['Code'], 'titulaire': fields['Parties'],
                'type': fields['Licence_'], 'substances': fields['Commodit'],
                'statut': fields['Status'], 'demande': date(fields['Applicat']),
                'delivrance': date(fields['Grant_Da']), 'expiration': date(fields['Expiry_D']),
                'surface_source': fields['Area'], 'reference_source': fields['Map_Refe'],
                'reference_demande': fields['Applica1'], 'guid_forme': fields['guidShap'],
                'guid_type': fields['guidType'], 'partie': fields['PartName'],
            }))
    write('permis', permits)
    print(Counter(f['properties']['statut'] for f in permits if f))

    river_zip = (SOURCES / 'rivers-source.zip').resolve().as_posix()
    source = ogr.Open('/vsizip/' + river_zip + '/HydroRIVERS_v10_af_shp/HydroRIVERS_v10_af.shp')
    layer = source.GetLayer()
    layer.SetSpatialFilterRect(*mask.bounds)
    rivers = []
    for record in layer:
        geom = geometry(record)
        for i in index.query(geom, predicate='intersects'):
            unit_geom, unit = units[i]
            rivers.append(feature(geom.intersection(unit_geom), {
                **unit, 'ordre': record['ORD_STRA'], 'hydrorivers_id': record['HYRIV_ID'],
            }, 'LineString'))
    topo = json.loads((SOURCES / 'hydro-cartes-cami.json').read_text(encoding='utf-8'))
    osm = json.loads((SOURCES / 'osm-source.json').read_text(encoding='utf-8'))
    longest = {}
    for item in osm['elements']:
        if len(item.get('geometry', [])) < 2:
            continue
        line = LineString([(node['lon'], node['lat']) for node in item['geometry']])
        original_name = item['tags'].get('name:fr') or item['tags']['name']
        name = topo['variantes'].get(original_name, original_name)
        for i in index.query(line, predicate='intersects'):
            unit_geom, unit = units[i]
            clipped = line.intersection(unit_geom)
            named = feature(clipped, {
                **unit, 'ordre': 5, 'nom_eau': name,
                'osm_id': item['id'],
                **({'nom_osm': original_name, 'source_nom': 'Cartes CAMI fournies'} if name != original_name else {}),
            }, 'LineString')
            if named:
                rivers.append(named)
                name = named['properties']['nom_eau']
                if clipped.length > longest.get(name, (0, None))[0]:
                    longest[name] = (clipped.length, named)
    site = topo['site1']

    def coordinate(pixel, axis):
        (p0, g0), (p1, g1) = site[axis]
        return g0 + (pixel - p0) * (g1 - g0) / (p1 - p0)

    for name, pixels in site['traces'].items():
        line = LineString([(coordinate(x, 'x'), coordinate(y, 'y')) for x, y in pixels])
        for i in index.query(line, predicate='intersects'):
            unit_geom, unit = units[i]
            named = feature(line.intersection(unit_geom), {
                **unit, 'ordre': 3, 'nom_eau': name, 'source_nom': 'Cartes CAMI fournies',
                'geometrie_approx': True,
            }, 'LineString')
            if named:
                rivers.append(named)
    for _, item in sorted(longest.values(), key=lambda pair: pair[0], reverse=True)[:12]:
        item['properties']['etiquette'] = True
    write('cours-eau', rivers)

    localities = []
    with ZipFile(SOURCES / 'geonames-source.zip') as archive, archive.open('CD.txt') as rows:
        for row in rows:
            fields = row.decode('utf-8').rstrip('\r\n').split('\t')
            if fields[6] != 'P' or fields[7] in {'PPLH', 'PPLQ', 'PPLX'}:
                continue
            point = Point(float(fields[5]), float(fields[4]))
            matches = index.query(point, predicate='intersects')
            if not len(matches):
                continue
            _, unit = units[min(matches)]
            localities.append(feature(point, {
                **unit, 'id': fields[0], 'nom': fields[1], 'unite_id': unit['id'],
                'unite': unit['nom'], 'classe': fields[7],
                'chef_lieu': fields[0] in {'204953', '214481'},  # Tshikapa et Kananga
            }, 'Point'))
    write('localites', localities)


if __name__ == '__main__':
    main()
