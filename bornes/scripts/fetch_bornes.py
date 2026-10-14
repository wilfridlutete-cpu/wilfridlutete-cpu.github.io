#!/usr/bin/env python3
"""
Collecte des bornes de recharge pour véhicules électriques en Belgique et export
en GeoJSON + CSV + statistiques pour le géoportail.

Sources :
  1. Bruxelles Mobilité — couche officielle « evse » (data.mobility.brussels, service WFS).
     Si le service ne répond pas : copie locale sources/evse_bruxelles.csv (Lambert 2008, EPSG:3812).
  2. Région flamande (MOW) — couche « laadpunten_public » (service WFS), facultative.
  3. OpenStreetMap (API Overpass) — toute la Belgique, © contributeurs OpenStreetMap, ODbL 1.0.
Une borne OSM située à moins de 40 m d'une borne officielle est considérée comme un doublon.

Usage :
  python scripts/fetch_bornes.py              collecte complète (réseau requis)
  python scripts/fetch_bornes.py --hors-ligne Bruxelles seulement, depuis sources/evse_bruxelles.csv
Sortie : data/bornes.geojson, data/bornes.csv, data/stats.json
Bibliothèque standard Python uniquement (3.10+).
"""
import csv
import json
import math
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "data"
CSV_BRUXELLES = ROOT / "sources" / "evse_bruxelles.csv"
USER_AGENT = "geoportail-bornes-be/1.2 (open data project)"

SRC_OSM = "OpenStreetMap"
SRC_BXL = "Bruxelles Mobilité"
SRC_VL = "Vlaanderen (MOW)"

# ---------------------------------------------------------------- sources officielles
BXL_WFS = ("https://data.mobility.brussels/geoserver/bm_equipment/wfs?service=WFS&version=2.0.0"
           "&request=GetFeature&typeNames=bm_equipment:evse&outputFormat=application/json&srsName=EPSG:4326")
VL_WFS = ("https://geoserver.gis.cloud.mow.vlaanderen.be/geoserver/beleid/wfs?service=WFS&version=2.0.0"
          "&request=GetFeature&typeNames=beleid:laadpunten_public&outputFormat=application/json&srsName=EPSG:4326")

# ---------------------------------------------------------------- OpenStreetMap
OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]
REGIONS = {"BE-BRU": "Bruxelles-Capitale", "BE-VLG": "Flandre", "BE-WAL": "Wallonie"}

QUERY_TEMPLATE = """
[out:json][timeout:300];
area["ISO3166-2"="{code}"]->.r;
(
  node["amenity"="charging_station"](area.r);
  way["amenity"="charging_station"](area.r);
);
out center tags;
"""
# Commune de chaque borne OSM : on parcourt les communes (admin_level 8) de la région.
COMMUNES_TEMPLATE = """
[out:json][timeout:600];
area["ISO3166-2"="{code}"]->.r;
rel(area.r)["boundary"="administrative"]["admin_level"="8"];
map_to_area->.communes;
foreach.communes->.c(
  .c out tags;
  (
    node["amenity"="charging_station"](area.c);
    way["amenity"="charging_station"](area.c);
  );
  out ids;
);
"""

SOCKETS = {
    "type2": "Type 2",
    "type2_cable": "Type 2 (câble)",
    "type2_combo": "CCS",
    "tesla_supercharger_ccs": "CCS",
    "chademo": "CHAdeMO",
    "tesla_supercharger": "Tesla",
    "type1": "Type 1",
    "type1_combo": "CCS1",
    "schuko": "Prise domestique",
    "typee": "Prise domestique",
    "cee_blue": "CEE bleue",
}
DC_SOCKETS = {"CCS", "CHAdeMO", "Tesla", "CCS1"}

# Regroupement des variantes d'écriture d'un même opérateur. Liste identique dans index.html.
RESEAUX = [
    (r"not published|^unknown$|^inconnu", "Non renseigné"),
    (r"total|pitpoint", "TotalEnergies"),
    (r"engie|vianeo|equans", "ENGIE Vianeo"),
    (r"allego", "Allego"),
    (r"shell|newmotion|ubitricity", "Shell Recharge"),
    (r"fastned", "Fastned"),
    (r"ionity", "IONITY"),
    (r"tesla", "Tesla"),
    (r"blue ?corner", "Blue Corner"),
    (r"powerdale", "Powerdale"),
    (r"electra", "Electra"),
    (r"powerdot", "Powerdot"),
    (r"izivia", "Izivia"),
    (r"luminus", "Luminus"),
    (r"eneco", "Eneco"),
    (r"wattif", "Wattif"),
    (r"optimile", "Optimile"),
    (r"energy ?vision", "EnergyVision"),
    (r"ieteren|power ?dale", "D’Ieteren Energy"),
    (r"mobiflow", "Mobiflow"),
    (r"ez ?charge", "EZ Charge"),
    (r"mobility ?plus|mobility\+", "Mobility Plus"),
    (r"blink", "Blink Charging"),
    (r"evbox", "EVBox"),
    (r"e-?flux", "E-Flux"),
    (r"50 ?five", "50five"),
    (r"chargepoint", "ChargePoint"),
    (r"chargewell", "Chargewell"),
    (r"lidl", "Lidl"),
    (r"aldi", "Aldi"),
    (r"ikea", "IKEA"),
    (r"colruyt|dats ?24", "DATS 24 (Colruyt)"),
    (r"delhaize", "Delhaize"),
    (r"interparking", "Interparking"),
    (r"indigo", "Indigo"),
    (r"q8|kuwait", "Q8"),
    (r"\bbp\b|aral|pulse", "bp pulse"),
    (r"cambio", "Cambio"),
    (r"bolt", "Bolt"),
]

TYPES_LIEU = {
    "ON_STREET": "Voirie", "PARKING_LOT": "Parking", "PARKING_GARAGE": "Parking couvert",
    "UNDERGROUND_GARAGE": "Parking souterrain", "OTHER": "Autre", "UNKNOWN": "",
}
STANDARDS = {
    "IEC_62196_T2": "Type 2", "IEC_62196_T2_COMBO": "CCS", "CHADEMO": "CHAdeMO",
    "DOMESTIC_E": "Prise domestique", "DOMESTIC_F": "Prise domestique", "IEC_62196_T1": "Type 1",
    "IEC_62196_T1_COMBO": "CCS1", "TESLA_S": "Tesla", "TESLA_R": "Tesla",
}


# ================================================================ outils
def http(url: str, data: bytes | None = None, timeout: int = 660) -> dict:
    req = urllib.request.Request(url, data=data, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.load(resp)


def overpass(query: str) -> dict:
    data = urllib.parse.urlencode({"data": query}).encode()
    last_error = None
    for url in OVERPASS_URLS:
        for attempt in range(2):
            try:
                return http(url, data)
            except Exception as exc:  # serveur saturé, délai dépassé…
                last_error = exc
                print(f"  ! {url} essai {attempt + 1} : {exc}", file=sys.stderr)
                time.sleep(20)
    raise RuntimeError(f"Tous les serveurs Overpass ont échoué : {last_error}")


def parse_kw(value) -> float | None:
    """'22 kW', '50', '150kW;50 kW', '11000 W' -> plus grande valeur en kW."""
    if not value:
        return None
    best = None
    for part in re.split(r"[;,/]", str(value)):
        m = re.search(r"([\d.]+)\s*(kw|w|kva)?", part.strip().lower())
        if not m:
            continue
        try:
            num = float(m.group(1))
        except ValueError:
            continue
        unit = m.group(2) or "kw"
        if unit == "w" or (unit == "kw" and num > 1000):
            num = num / 1000
        if 0 < num <= 1000:
            best = num if best is None else max(best, num)
    return best


def power_class(kw: float | None) -> str:
    if kw is None:
        return "inconnue"
    if kw < 22:
        return "lente"        # < 22 kW
    if kw < 50:
        return "acceleree"    # 22 à 49 kW
    if kw < 150:
        return "rapide"       # 50 à 149 kW
    return "ultra"            # 150 kW et plus


def reseau(raw: str) -> str:
    if not raw or not raw.strip():
        return "Non renseigné"
    for pattern, name in RESEAUX:
        if re.search(pattern, raw, re.IGNORECASE):
            return name
    return raw.strip()


def courant(sockets: list[str], kw: float | None) -> str:
    if any(s in DC_SOCKETS for s in sockets) or (kw is not None and kw >= 50):
        return "DC"
    if sockets or kw is not None:
        return "AC"
    return ""


def base_properties(**kw) -> dict:
    """Toutes les propriétés du schéma, avec leurs valeurs par défaut."""
    p = {
        "osm_id": "", "ref": "", "source": "", "nom": "", "operateur": "", "reseau": "Non renseigné",
        "region": "", "commune": "", "adresse": "", "type_lieu": "", "puissance_kw": None,
        "puissance_estimee": False, "classe": "inconnue", "courant": "", "prises": [], "points": None,
        "vehicules": [], "payant": "", "tarif": "", "paiement": [], "stationnement_payant": "",
        "acces": "", "horaires": "", "h24": False, "verifie_le": "",
    }
    p.update(kw)
    return p


def feature(lon: float, lat: float, props: dict) -> dict:
    return {"type": "Feature",
            "geometry": {"type": "Point", "coordinates": [round(lon, 6), round(lat, 6)]},
            "properties": props}


# ================================================================ Lambert 2008 -> WGS84
def lambert2008_to_wgs84(x: float, y: float) -> tuple[float, float]:
    """EPSG:3812 (ETRS89 / Belgian Lambert 2008) vers longitude, latitude (ETRS89 ≈ WGS84)."""
    a, f = 6378137.0, 1 / 298.257222101
    e = math.sqrt(2 * f - f * f)
    p1, p2, p0 = map(math.radians, (49 + 50 / 60, 51 + 10 / 60, 50 + 47 / 60 + 52.134 / 3600))
    l0 = math.radians(4 + 21 / 60 + 33.177 / 3600)
    x0, y0 = 649328.0, 665262.0
    m = lambda p: math.cos(p) / math.sqrt(1 - (e * math.sin(p)) ** 2)
    t = lambda p: math.tan(math.pi / 4 - p / 2) / ((1 - e * math.sin(p)) / (1 + e * math.sin(p))) ** (e / 2)
    n = (math.log(m(p1)) - math.log(m(p2))) / (math.log(t(p1)) - math.log(t(p2)))
    F = m(p1) / (n * t(p1) ** n)
    r0 = a * F * t(p0) ** n
    dx, dy = x - x0, r0 - (y - y0)
    r = math.copysign(math.hypot(dx, dy), n)
    tt = (r / (a * F)) ** (1 / n)
    lon = math.atan2(dx, dy) / n + l0
    lat = math.pi / 2 - 2 * math.atan(tt)
    for _ in range(10):
        es = e * math.sin(lat)
        lat = math.pi / 2 - 2 * math.atan(tt * ((1 - es) / (1 + es)) ** (e / 2))
    return math.degrees(lon), math.degrees(lat)


# ================================================================ Bruxelles Mobilité
def bxl_feature(lon: float, lat: float, r: dict) -> dict:
    types = (r.get("connector_type") or "").upper()
    prises = []
    fmt = (r.get("connector_format") or "").upper()
    for std in (r.get("connector_standard") or "").split(";"):
        lib = STANDARDS.get(std.strip().upper())
        if lib == "Type 2" and fmt == "CABLE":
            lib = "Type 2 (câble)"
        if lib and lib not in prises:
            prises.append(lib)
    # La couche ne publie pas la puissance en kW (le champ « power » est une tension en volts).
    # Estimation prudente d'après le type de courant : DC ≥ 50 kW, triphasé 22 kW, monophasé 7,4 kW.
    if "DC" in types:
        kw = 50.0
    elif "3_PHASE" in types:
        kw = 22.0
    elif "1_PHASE" in types:
        kw = 7.4
    else:
        kw = None
    try:
        points = int(r.get("charging_points") or 0) or None
    except ValueError:
        points = None
    op = (r.get("operator_name") or "").strip()
    return feature(lon, lat, base_properties(
        ref=r.get("location_id") or "", source=SRC_BXL, operateur=op, reseau=reseau(op),
        region="Bruxelles-Capitale", type_lieu=TYPES_LIEU.get((r.get("location_type") or "").upper(), ""),
        puissance_kw=kw, puissance_estimee=kw is not None, classe=power_class(kw),
        courant="DC" if "DC" in types else ("AC" if types else ""),
        prises=prises, points=points, vehicules=["Voiture"],
    ))


def collect_bruxelles(offline: bool) -> list[dict]:
    if not offline:
        try:
            gj = http(BXL_WFS, timeout=180)
            feats = [bxl_feature(*f["geometry"]["coordinates"][:2], f["properties"])
                     for f in gj.get("features", []) if f.get("geometry")]
            if len(feats) >= 500:
                print(f"  {len(feats)} sites (service en ligne)")
                return feats
            print(f"  ! service en ligne : seulement {len(feats)} sites, repli sur la copie locale", file=sys.stderr)
        except Exception as exc:
            print(f"  ! service en ligne indisponible ({exc}), repli sur la copie locale", file=sys.stderr)
    if not CSV_BRUXELLES.exists():
        print("  ! pas de copie locale sources/evse_bruxelles.csv", file=sys.stderr)
        return []
    feats = []
    with open(CSV_BRUXELLES, encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            m = re.match(r"POINT\s*\(\s*([\d.\-]+)\s+([\d.\-]+)", r.get("geom") or "")
            if m:
                lon, lat = lambert2008_to_wgs84(float(m.group(1)), float(m.group(2)))
                feats.append(bxl_feature(lon, lat, r))
    print(f"  {len(feats)} sites (copie locale du {time.strftime('%d/%m/%Y', time.localtime(CSV_BRUXELLES.stat().st_mtime))})")
    return feats


# ================================================================ Région flamande (facultatif)
def pick(props: dict, *patterns):
    for key, val in props.items():
        if val not in (None, "") and any(re.search(p, key, re.IGNORECASE) for p in patterns):
            return val
    return None


def collect_vlaanderen() -> list[dict]:
    """Couche publique flamande. Les noms de champs sont repérés par mots-clés ; en cas d'échec, on continue sans."""
    try:
        gj = http(VL_WFS, timeout=300)
    except Exception as exc:
        print(f"  ! service flamand indisponible ({exc}) : la Flandre reste couverte par OpenStreetMap", file=sys.stderr)
        return []
    raw = [f for f in gj.get("features", []) if f.get("geometry") and f["geometry"].get("type") == "Point"]
    if raw:
        print(f"  champs disponibles : {', '.join(sorted(raw[0].get('properties', {})))}")
    # Contrôle : les coordonnées doivent être des degrés situés en Belgique (sinon le service a ignoré srsName).
    dans_be = [f for f in raw if 2.4 < f["geometry"]["coordinates"][0] < 6.5 and 49.4 < f["geometry"]["coordinates"][1] < 51.6]
    if raw and len(dans_be) < 0.9 * len(raw):
        print("  ! coordonnées flamandes inattendues : source ignorée, la Flandre reste couverte par OpenStreetMap",
              file=sys.stderr)
        return []
    feats = []
    for f in dans_be:
        p = f.get("properties", {})
        lon, lat = f["geometry"]["coordinates"][:2]
        op = str(pick(p, r"operator", r"uitbater", r"exploitant", r"cpo", r"beheerder") or "")
        kw = parse_kw(pick(p, r"vermogen", r"power", r"kw"))
        stekker = str(pick(p, r"stekker", r"connector", r"plug") or "").upper()
        prises = [lib for key, lib in (("COMBO", "CCS"), ("CCS", "CCS"), ("CHADEMO", "CHAdeMO"), ("TYPE 2", "Type 2"),
                                        ("T2", "Type 2"), ("TYPE2", "Type 2")) if key in stekker]
        prises = list(dict.fromkeys(prises))
        try:
            points = int(float(pick(p, r"aantal", r"number", r"count", r"laadpunten") or 0)) or None
        except (TypeError, ValueError):
            points = None
        adresse = " ".join(str(x) for x in (pick(p, r"straat", r"street"), pick(p, r"huisn", r"housen")) if x)
        feats.append(feature(lon, lat, base_properties(
            ref=str(f.get("id") or ""), source=SRC_VL, operateur=op, reseau=reseau(op), region="Flandre",
            commune=str(pick(p, r"gemeente", r"municipal", r"city") or ""), adresse=adresse,
            puissance_kw=kw, classe=power_class(kw), courant=courant(prises, kw), prises=prises,
            points=points, vehicules=["Voiture"])))
    # La couche peut lister chaque point de charge séparément : on regroupe ceux d'un même emplacement.
    groupes = {}
    for f in feats:
        lon, lat = f["geometry"]["coordinates"]
        k = (round(lon, 5), round(lat, 5), f["properties"]["reseau"])
        if k not in groupes:
            groupes[k] = f
            f["properties"]["points"] = f["properties"]["points"] or 1
            continue
        g = groupes[k]["properties"]
        p = f["properties"]
        g["points"] += p["points"] or 1
        if p["puissance_kw"] and (g["puissance_kw"] or 0) < p["puissance_kw"]:
            g["puissance_kw"] = p["puissance_kw"]
            g["classe"] = power_class(p["puissance_kw"])
        g["prises"] = list(dict.fromkeys(g["prises"] + p["prises"]))
        g["courant"] = courant(g["prises"], g["puissance_kw"])
    feats = list(groupes.values())
    print(f"  {len(feats)} emplacements (service flamand)")
    return feats


# ================================================================ OpenStreetMap
def yes(tags: dict, *keys) -> bool:
    return any(tags.get(k) == "yes" for k in keys)


def paiements(tags: dict) -> list[str]:
    out = []
    if yes(tags, "payment:credit_cards", "payment:debit_cards", "payment:contactless",
           "payment:visa", "payment:mastercard", "payment:maestro", "payment:bancontact"):
        out.append("Carte bancaire")
    if yes(tags, "payment:app", "authentication:app"):
        out.append("Application")
    if yes(tags, "authentication:membership_card", "authentication:nfc", "payment:rfid"):
        out.append("Badge RFID")
    if yes(tags, "authentication:none"):
        out.append("Sans identification")
    return out


def vehicules(tags: dict) -> list[str]:
    out = []
    if tags.get("motorcar") != "no":
        out.append("Voiture")
    if tags.get("bicycle") == "yes":
        out.append("Vélo")
    if tags.get("hgv") == "yes":
        out.append("Poids lourd")
    return out


def to_feature(el: dict, region: str, commune: str = "") -> dict | None:
    tags = el.get("tags", {})
    if "lat" in el:
        lat, lon = el["lat"], el["lon"]
    elif "center" in el:
        lat, lon = el["center"]["lat"], el["center"]["lon"]
    else:
        return None

    sockets, powers = [], []
    for key, label in SOCKETS.items():
        if f"socket:{key}" in tags and tags.get(f"socket:{key}") not in ("no", "0"):
            if label not in sockets:
                sockets.append(label)
            kw = parse_kw(tags.get(f"socket:{key}:output"))
            if kw:
                powers.append(kw)
    for k in ("charging_station:output", "maxpower", "output"):
        kw = parse_kw(tags.get(k))
        if kw:
            powers.append(kw)
    kw_max = max(powers) if powers else None

    capacity = tags.get("capacity")
    try:
        capacity = int(capacity) if capacity else None
    except ValueError:
        capacity = None

    operateur = tags.get("operator") or tags.get("brand") or tags.get("network") or ""
    horaires = tags.get("opening_hours") or ""
    return feature(lon, lat, base_properties(
        osm_id=f"{el['type']}/{el['id']}", source=SRC_OSM, nom=tags.get("name") or "",
        operateur=operateur, reseau=reseau(operateur), region=region,
        commune=commune or tags.get("addr:city") or "",
        adresse=" ".join(x for x in [tags.get("addr:street"), tags.get("addr:housenumber")] if x),
        puissance_kw=kw_max, classe=power_class(kw_max), courant=courant(sockets, kw_max),
        prises=sockets, points=capacity, vehicules=vehicules(tags),
        payant={"yes": "oui", "no": "non"}.get(tags.get("fee", ""), ""), tarif=tags.get("charge") or "",
        paiement=paiements(tags),
        stationnement_payant={"yes": "oui", "no": "non"}.get(tags.get("parking:fee", ""), ""),
        acces=tags.get("access") or "", horaires=horaires, h24=horaires.strip() == "24/7",
        verifie_le=tags.get("check_date") or tags.get("survey:date") or "",
    ))


def communes_par_borne(code: str, region: str) -> dict:
    """osm_id -> nom de commune. En cas d'échec, dictionnaire vide (repli sur addr:city)."""
    lang = "name:nl" if region == "Flandre" else "name:fr"
    mapping, current = {}, ""
    try:
        result = overpass(COMMUNES_TEMPLATE.format(code=code))
    except RuntimeError as exc:
        print(f"  ! communes indisponibles pour {region} : {exc}", file=sys.stderr)
        return mapping
    for el in result.get("elements", []):
        if el["type"] == "area":
            t = el.get("tags", {})
            current = t.get(lang) or t.get("name") or ""
        else:
            mapping.setdefault(f"{el['type']}/{el['id']}", current)
    return mapping


def collect_osm() -> list[dict]:
    features, seen = [], set()
    for code, region in REGIONS.items():
        print(f"OpenStreetMap — {region}…")
        result = overpass(QUERY_TEMPLATE.format(code=code))
        time.sleep(5)  # courtoisie envers le serveur public
        communes = communes_par_borne(code, region)
        n = 0
        for el in result.get("elements", []):
            key = f"{el['type']}/{el['id']}"
            if key in seen:
                continue
            f = to_feature(el, region, communes.get(key, ""))
            if f:
                features.append(f)
                seen.add(key)
                n += 1
        print(f"  {n} bornes ({len(communes)} rattachées à une commune)")
        time.sleep(5)
    return features


# ================================================================ fusion
class Grille:
    """Index spatial simple (cases d'environ 1 km) pour les recherches de voisins."""
    def __init__(self, feats):
        self.cells = {}
        for f in feats:
            self.cells.setdefault(self.key(*f["geometry"]["coordinates"]), []).append(f)

    @staticmethod
    def key(lon, lat):
        return int(lon / 0.014), int(lat / 0.009)

    def voisins(self, lon, lat):
        kx, ky = self.key(lon, lat)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                yield from self.cells.get((kx + dx, ky + dy), [])


def distance_m(a, b) -> float:
    lon1, lat1 = a
    lon2, lat2 = b
    x = math.radians(lon2 - lon1) * math.cos(math.radians((lat1 + lat2) / 2))
    return 6371000 * math.hypot(x, math.radians(lat2 - lat1))


def fusionner(officiels: list[dict], osm: list[dict]) -> list[dict]:
    # 1. Commune des bornes officielles sans commune : celle de la borne OSM la plus proche (moins de 1,5 km).
    avec_commune = Grille([f for f in osm if f["properties"]["commune"]])
    for f in officiels:
        p = f["properties"]
        if p["commune"]:
            continue
        c = f["geometry"]["coordinates"]
        best = min(((distance_m(c, g["geometry"]["coordinates"]), g) for g in avec_commune.voisins(*c)
                    if g["properties"]["region"] == p["region"]), default=None, key=lambda x: x[0])
        if best and best[0] < 1500:
            p["commune"] = best[1]["properties"]["commune"]
    # 2. Doublons : une borne OSM à moins de 40 m d'une borne officielle est écartée,
    #    mais ses informations utiles (nom, horaires, tarif…) complètent la borne officielle.
    grille = Grille(officiels)
    gardes, doublons = [], 0
    for f in osm:
        c = f["geometry"]["coordinates"]
        proche = min(((distance_m(c, g["geometry"]["coordinates"]), g) for g in grille.voisins(*c)),
                     default=None, key=lambda x: x[0])
        if proche and proche[0] < 40:
            doublons += 1
            po, pf = proche[1]["properties"], f["properties"]
            for k in ("nom", "adresse", "payant", "tarif", "paiement", "stationnement_payant",
                      "acces", "horaires", "h24", "verifie_le", "osm_id"):
                if not po[k] and pf[k]:
                    po[k] = pf[k]
            continue
        gardes.append(f)
    print(f"Fusion : {doublons} bornes OSM reconnues comme doublons d'une borne officielle")
    return officiels + gardes


# ================================================================ écriture
DEFAUTS = base_properties()


def compacte(f: dict) -> dict:
    """Retire les propriétés vides ou par défaut (la page les recrée) pour alléger le fichier publié."""
    p = {k: v for k, v in f["properties"].items() if v not in ("", None, [], False) and not (k == "reseau" and v == "Non renseigné")}
    return {"type": "Feature", "geometry": f["geometry"], "properties": p}


def ecrire(features: list[dict]) -> None:
    OUT_DIR.mkdir(exist_ok=True)
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    sources = sorted({f["properties"]["source"] for f in features})
    geojson = {
        "type": "FeatureCollection",
        "metadata": {
            "genere_le": now,
            "sources": sources,
            "licences": {
                SRC_OSM: "ODbL 1.0 — © contributeurs OpenStreetMap",
                SRC_BXL: "Bruxelles Mobilité, data.mobility.brussels (données ouvertes)",
                SRC_VL: "Departement Mobiliteit en Openbare Werken, Vlaamse overheid",
            },
        },
        "features": [compacte(f) for f in features],
    }
    (OUT_DIR / "bornes.geojson").write_text(
        json.dumps(geojson, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    cols = ["source", "osm_id", "ref", "nom", "operateur", "reseau", "region", "commune", "adresse", "type_lieu",
            "puissance_kw", "puissance_estimee", "classe", "courant", "prises", "points", "vehicules", "payant",
            "tarif", "paiement", "stationnement_payant", "acces", "horaires", "h24", "verifie_le", "lat", "lon"]
    with open(OUT_DIR / "bornes.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        for f in features:
            p = dict(f["properties"])
            for k in ("prises", "paiement", "vehicules"):
                p[k] = "|".join(p[k])
            for k in ("h24", "puissance_estimee"):
                p[k] = "oui" if p[k] else "non"
            p["lon"], p["lat"] = f["geometry"]["coordinates"]
            w.writerow(p)

    stats = {"genere_le": now, "total": len(features), "points": 0,
             "par_source": {}, "par_region": {}, "par_classe": {}, "par_reseau": {}}
    for f in features:
        p = f["properties"]
        stats["points"] += p["points"] or 1
        for key, val in (("par_source", p["source"]), ("par_region", p["region"]),
                         ("par_classe", p["classe"]), ("par_reseau", p["reseau"])):
            stats[key][val] = stats[key].get(val, 0) + 1
    stats["par_reseau"] = dict(sorted(stats["par_reseau"].items(), key=lambda kv: -kv[1]))
    (OUT_DIR / "stats.json").write_text(json.dumps(stats, ensure_ascii=False, indent=2), encoding="utf-8")
    for region, n in stats["par_region"].items():
        print(f"  {region} : {n}")
    print(f"Terminé : {len(features)} bornes ({stats['points']} points de charge) écrites dans {OUT_DIR}")


def main() -> None:
    offline = "--hors-ligne" in sys.argv
    print("Bruxelles Mobilité…")
    officiels = collect_bruxelles(offline)
    if offline:
        if len(officiels) < 500:
            sys.exit("Copie locale absente ou incomplète : fichiers non modifiés.")
        ecrire(officiels)
        return

    print("Région flamande…")
    officiels += collect_vlaanderen()
    osm = collect_osm()
    if len(osm) < 1000:
        # Garde-fou : ne jamais écraser un bon fichier par une collecte ratée.
        sys.exit(f"Seulement {len(osm)} bornes OpenStreetMap : collecte jugée incomplète, fichiers non modifiés.")
    ecrire(fusionner(officiels, osm))


if __name__ == "__main__":
    main()
