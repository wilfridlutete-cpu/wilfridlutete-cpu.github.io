const L = window.L;
const form = document.querySelector('#filters');
const get = (id) => document.getElementById(id);
const map = L.map('map', { maxZoom: 19 }).setView([-5.5, 21.9], 7);
const sidebar = get('sidebar');
const sidebarToggle = get('sidebar-toggle');
const compactLayout = matchMedia('(max-width: 740px)');

function setSidebar(open) {
  if (!open && sidebar.contains(document.activeElement)) sidebarToggle.focus();
  sidebar.hidden = !open;
  sidebarToggle.setAttribute('aria-expanded', String(open));
  sidebarToggle.textContent = open ? 'Filtres ‹' : 'Filtres ›';
  if (open) map.fire('sidebaropened');
}

sidebarToggle.hidden = false;
setSidebar(false);
sidebarToggle.addEventListener('click', () => setSidebar(sidebar.hidden));
get('close-sidebar').addEventListener('click', () => {
  setSidebar(false);
  sidebarToggle.focus();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !sidebar.hidden && !get('catalogue').open &&
      (sidebar.contains(document.activeElement) || document.activeElement === sidebarToggle || compactLayout.matches)) {
    setSidebar(false);
    sidebarToggle.focus();
  }
});
const mapResize = new ResizeObserver(() => map.invalidateSize({ animate: false }));
mapResize.observe(get('map'));

L.control.scale({ imperial: false }).addTo(map);
get('map-zoom').append(map.zoomControl.getContainer());
map.attributionControl.setPrefix('<a href="https://leafletjs.com/" title="A JavaScript library for interactive maps">Leaflet</a> · <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, <a href="https://wilfridlutete-cpu.github.io/">Wilfrid Lutete</a>');

const styles = {
  rdc: {
    province: { stroke: false, fillOpacity: 0 },
    frontiere: { color: '#fff', weight: 3.6, interactive: false },
    interieur: { color: '#fff', weight: 1.9, dashArray: '6 5', interactive: false },
    'kasai-interieur': { color: '#fff', weight: 2.8, interactive: false },
  },
  kasai: { color: '#fff', weight: 2.8, fillOpacity: 0 },
  unites: { color: '#56766f', weight: 1, dashArray: '4 4', fillOpacity: 0 },
  'cours-eau': (feature) => ({
    color: '#1884b6', opacity: 0.75, weight: Math.max(0.8, (feature.properties.ordre - 1) * 0.42),
    dashArray: feature.properties.geometrie_approx ? '3 3' : undefined,
  }),
};
const labels = ['Échéance non atteinte', 'Échéance passée', 'Échéance non renseignée'];
const colors = ['#0d8764', '#ba512e', '#68678e'];
const parts = Object.fromEntries(new Intl.DateTimeFormat('fr', {
  timeZone: 'Africa/Lubumbashi', year: 'numeric', month: '2-digit', day: '2-digit',
}).formatToParts(new Date()).map(({ type, value }) => [type, value]));
const today = [parts.year, parts.month, parts.day].join('-');
const displayDate = (value) => value ? value.split('-').reverse().join('/') : 'Non renseignée';
const term = (p) => labels[p.expiration ? Number(p.expiration < today) : 2];
const normalize = (value) => String(value ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
get('as-of').textContent = displayDate(today);

const layers = {};
const collections = {};
const toggles = [...document.querySelectorAll('[data-layer]')];
const toggleFor = (name) => toggles.find((input) => input.dataset.layer === name);
const mapControls = [...toggles, ...['osm', 'esri', 'nasa'].map(get)];

function updateEmptyMap() {
  get('map-empty').hidden = mapControls.some((control) => control.checked && !control.disabled);
}
for (const control of mapControls) control.addEventListener('change', () => queueMicrotask(updateEmptyMap));

function details(title, fields) {
  const section = document.createElement('section');
  const heading = document.createElement('strong');
  heading.textContent = title;
  section.append(heading);
  const list = document.createElement('dl');
  for (const [name, value] of fields) {
    const label = document.createElement('dt');
    const datum = document.createElement('dd');
    label.textContent = name;
    datum.textContent = value || 'Non renseigné';
    list.append(label, datum);
  }
  section.append(list);
  return section;
}

const mapContainer = map.getContainer();
const hoverCard = document.createElement('div');
hoverCard.className = 'map-hover-card';
hoverCard.hidden = true;
hoverCard.setAttribute('aria-hidden', 'true');
mapContainer.append(hoverCard);
let hoveredLayer;
let featurePopup;

function hideHoverCard() {
  hoveredLayer = undefined;
  hoverCard.hidden = true;
}

map.on('movestart zoomstart popupopen', hideHoverCard);
mapContainer.addEventListener('pointerleave', hideHoverCard);

const featurePopupOptions = { className: 'feature-popup', autoPan: false, minWidth: 265, maxWidth: 340 };

function positionFeaturePopup() {
  if (!featurePopup) return;
  const popup = featurePopup.getElement();
  const { width, height, left, top } = popup.getBoundingClientRect();
  const container = mapContainer.getBoundingClientRect();
  const size = map.getSize();
  const point = map.latLngToContainerPoint(featurePopup.getLatLng());
  const gap = 13;
  const margin = 8;
  const fitsRight = point.x + gap + width <= size.x - margin;
  const fitsLeft = point.x - gap - width >= margin;
  let side;
  let x;
  let y;
  if (fitsRight || fitsLeft) {
    side = fitsRight ? 'right' : 'left';
    x = fitsRight ? point.x + gap : point.x - gap - width;
    y = point.y - height / 2;
  } else {
    side = point.y >= size.y / 2 ? 'above' : 'below';
    x = point.x - width / 2;
    y = side === 'above' ? point.y - gap - height : point.y + gap;
  }
  x = Math.round(Math.max(margin, Math.min(x, size.x - width - margin)));
  y = Math.round(Math.max(margin, Math.min(y, size.y - height - margin)));
  popup.dataset.side = side;
  popup.style.setProperty('--arrow-x', Math.max(15, Math.min(point.x - x, width - 15)) + 'px');
  popup.style.setProperty('--arrow-y', Math.max(15, Math.min(point.y - y, height - 15)) + 'px');
  const dx = Math.round(x - (left - container.left));
  const dy = Math.round(y - (top - container.top));
  if (dx || dy) {
    const scroll = popup.querySelector('dl').scrollTop;
    featurePopup.options.offset = L.point(featurePopup.options.offset).add([dx, dy]);
    featurePopup.update();
    popup.querySelector('dl').scrollTop = scroll;
  }
}

map.on('popupopen', ({ popup }) => {
  if (popup.options.className !== featurePopupOptions.className) return;
  featurePopup = popup;
  positionFeaturePopup();
});
map.on('popupclose', ({ popup }) => {
  if (featurePopup === popup) featurePopup = undefined;
});
map.on('moveend resize', positionFeaturePopup);

function bindHoverCard(layer, content) {
  layer.on('mouseover mousemove', ({ containerPoint, originalEvent }) => {
    if (!containerPoint || originalEvent?.pointerType === 'touch' || originalEvent?.sourceCapabilities?.firesTouchEvents ||
        mapContainer.classList.contains('map-selection') || featurePopup) {
      hideHoverCard();
      return;
    }
    if (hoveredLayer !== layer) {
      hoverCard.replaceChildren(content());
      hoverCard.hidden = false;
      hoveredLayer = layer;
    }
    const { x, y } = containerPoint;
    const { offsetWidth: width, offsetHeight: height } = hoverCard;
    const right = mapContainer.clientWidth - width - 8;
    const bottom = mapContainer.clientHeight - height - 8;
    const left = x + 14 <= right ? x + 14 : x - width - 14;
    const top = y + 14 <= bottom ? y + 14 : y - height - 14;
    hoverCard.style.transform = `translate(${Math.max(8, Math.min(left, right))}px, ${Math.max(8, Math.min(top, bottom))}px)`;
  });
  layer.on('mouseout remove', () => {
    if (hoveredLayer === layer) hideHoverCard();
  });
  layer.on('click', () => requestAnimationFrame(positionFeaturePopup));
}

function permitFields(p) {
  return [
    ['Code', p.code],
    ['Titulaire', p.titulaire], ['Type', p.type], ['Substances', p.substances],
    ['Statut cadastral fourni', p.statut], ['Échéance calculée', term(p)],
    ['Demande', displayDate(p.demande)], ['Délivrance', displayDate(p.delivrance)],
    ['Expiration', displayDate(p.expiration)], ['Province · unité', p.province + ' · ' + p.nom],
    ['Surface du dossier source', p.surface_source], ['Référence cartographique source', p.reference_source],
    ['Référence de la demande', p.reference_demande], ['Partie', p.partie],
    ['Identifiant de forme', p.guid_forme], ['Identifiant de type', p.guid_type],
  ];
}

function permitDetails(p) {
  const section = details('Titre ' + (p.code || 'sans code'), permitFields(p));
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Inclure la fiche dans la carte';
  button.addEventListener('click', () => {
    map.fire('permitprint', { permit: p, fields: permitFields(p) });
    map.closePopup();
  });
  section.append(button);
  return section;
}

function polygons(geometry) {
  return geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
}

function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 1; i < ring.length; i++) {
    const [ax, ay] = ring[i - 1];
    const [bx, by] = ring[i];
    if ((ay > y) !== (by > y) && x < ax + (y - ay) * (bx - ax) / (by - ay)) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point, [outer, ...holes]) {
  return pointInRing(point, outer) && !holes.some((hole) => pointInRing(point, hole));
}

function segmentsCross(a, b, c, d) {
  const side = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const boxesMeet = [0, 1].every((i) => Math.max(a[i], b[i]) >= Math.min(c[i], d[i])
    && Math.max(c[i], d[i]) >= Math.min(a[i], b[i]));
  return boxesMeet && side(a, b, c) * side(a, b, d) <= 0 && side(c, d, a) * side(c, d, b) <= 0;
}

function lineHitsPolygon(line, polygon) {
  if (line.some((point) => pointInPolygon(point, polygon))) return true;
  return polygon.some((ring) => ring.some((point, i) => i > 0
    && line.some((other, j) => j > 0 && segmentsCross(ring[i - 1], point, line[j - 1], other))));
}

function permitHover(path) {
  const { geometry, properties: p } = path.feature;
  const shape = polygons(geometry);
  const bounds = path.getBounds();
  const active = (name) => layers[name] && map.hasLayer(layers[name]);
  function matching(name, match) {
    if (!active(name)) return [];
    const matches = [];
    layers[name].eachLayer((candidate) => {
      const other = candidate.feature;
      const withinBounds = other.geometry.type === 'Point'
        ? bounds.contains(candidate.getLatLng()) : bounds.intersects(candidate.getBounds());
      if (withinBounds && match(other.geometry, other.properties)) matches.push(other.properties);
    });
    return matches;
  }
  function list(values, empty) {
    const unique = [...new Set(values)].sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
    if (!unique.length) return empty;
    return unique.slice(0, 8).join(', ') + (unique.length > 8 ? ' et ' + (unique.length - 8) + ' autres' : '');
  }
  const fields = [
    ['Type et statut', [p.type, p.statut].filter(Boolean).join(' · ')],
    ['Titulaire', p.titulaire], ['Substances', p.substances],
    ['Délivrance', displayDate(p.delivrance)], ['Expiration', displayDate(p.expiration)], ['Échéance calculée', term(p)],
    ['Surface du dossier', p.surface_source],
  ];
  if (active('rdc') || active('kasai')) fields.push(['Province', p.province]);
  if (active('unites')) fields.push(['Unité administrative', p.nom]);
  if (active('cours-eau')) {
    const water = matching('cours-eau', ({ type, coordinates }) => {
      const lines = type === 'LineString' ? [coordinates] : coordinates;
      return shape.some((polygon) => lines.some((line) => lineHitsPolygon(line, polygon)));
    });
    const named = list(water.map((river) => river.nom_eau).filter(Boolean), '');
    const unnamed = water.filter((river) => !river.nom_eau).length;
    fields.push(['Cours d’eau', [named, unnamed ? unnamed + ' tronçon(s) sans nom renseigné' : '']
      .filter(Boolean).join(' · ') || 'Aucun dans ce périmètre']);
  }
  if (active('localites')) {
    const places = matching('localites', ({ coordinates }) => shape.some((polygon) => pointInPolygon(coordinates, polygon)));
    fields.push(['Localités', list(places.map((place) => place.nom), 'Aucune dans ce périmètre')]);
  }
  const overlaps = matching('permis', (other, permit) => permit.id !== p.id
    && polygons(other).some((polygon) => shape.some((part) =>
      polygon.some((ring) => lineHitsPolygon(ring, part)) || pointInPolygon(part[0][0], polygon))));
  if (overlaps.length) fields.push(['Autres périmètres au contact', list(overlaps.map((permit) => String(permit.code)), '')]);
  for (const [id, name] of [['osm', 'OpenStreetMap'], ['esri', 'Satellite Esri HD'], ['nasa', 'Satellite NASA']]) {
    if (get(id).checked) fields.push(['Fond de carte', name]);
  }
  return details('Titre ' + (p.code || 'sans code'), fields);
}

function showLayer(name) {
  const layer = layers[name];
  if (layer) {
    const includedInRdc = name === 'kasai' && map.hasLayer(layers.rdc);
    if (toggleFor(name).checked && !includedInRdc) layer.addTo(map);
    else map.removeLayer(layer);
  }
  if (name === 'rdc') showLayer('kasai');
}
toggles.forEach((input) => input.addEventListener('change', () => showLayer(input.dataset.layer)));

function options(name, items) {
  const select = form.elements.namedItem(name);
  const old = select.value;
  select.length = 1;
  for (const [value, label] of items.sort((a, b) => a[1].localeCompare(b[1], 'fr'))) {
    select.add(new Option(label, value));
  }
  if ([...select.options].some((option) => option.value === old)) select.value = old;
}

function updateUnits() {
  options('unit', collections.unites.features
    .map((item) => item.properties)
    .map((p) => [p.id, p.nom]));
}

function scope(p, unit) {
  return p.province === 'Kasaï' && (!unit || (p.unite_id || p.id) === unit);
}

function fit() {
  const b = layers.unites?.getBounds();
  if (b?.isValid()) map.fitBounds(b.pad(0.08), { maxZoom: 13 });
}
get('fit').addEventListener('click', fit);

function render(refit = false) {
  const { search, unit, status, term: selectedTerm, type, from, to } = Object.fromEntries(new FormData(form));
  const invalid = Boolean(from && to && from > to);
  get('date-error').hidden = !invalid;
  const tokens = normalize(search).trim().split(/\s+/);
  const candidates = invalid ? [] : collections.permis.features.filter(({ properties: p }) => {
    const haystack = normalize([p.code, p.titulaire, p.substances].join(' '));
    return scope(p, unit) && (!status || status === p.statut)
      && (!type || type === p.type)
      && (!from || (p.delivrance && p.delivrance >= from))
      && (!to || (p.delivrance && p.delivrance <= to))
      && tokens.every((token) => haystack.includes(token));
  });
  const dossiers = new Map(candidates.map(({ properties: p }) => [p.id, term(p)]));
  const totals = new Map(labels.map((label) => [label, 0]));
  for (const category of dossiers.values()) totals.set(category, totals.get(category) + 1);
  for (const option of form.elements.namedItem('term').options) {
    option.textContent = option.value ? option.value + ' (' + totals.get(option.value) + ')' : 'Toutes';
  }
  const visible = selectedTerm ? candidates.filter(({ properties: p }) => term(p) === selectedTerm) : candidates;
  const inScope = ({ properties: p }) => scope(p, unit);
  layers.unites.clearLayers().addData(collections.unites.features.filter(inScope));
  layers['cours-eau']?.clearLayers().addData(collections['cours-eau'].features.filter(inScope));
  layers.localites?.clearLayers().addData(collections.localites.features.filter(inScope));
  layers.permis.clearLayers().addData(visible);
  map.fire('permitsfiltered', { features: visible });
  if (refit) fit();
  return visible;
}

async function fetchCollection(url, name) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(name + ' · HTTP ' + response.status);
  const data = await response.json();
  if (data.type !== 'FeatureCollection' || !Array.isArray(data.features)) throw new Error(name + ' · GeoJSON invalide');
  return data;
}

async function load(name) {
  const endpoint = new URLSearchParams(location.search).get('wfs');
  if (!endpoint || name === 'localites' || name === 'rdc') {
    const embedded = get('data-' + name);
    if (embedded) {
      collections[name] = JSON.parse(embedded.textContent);
      return;
    }
    collections[name] = await fetchCollection('data/' + name + '.geojson', name);
    return;
  }
  const url = new URL(endpoint, location.href);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('URL WFS HTTP(S) attendue');
  }
  const pageSize = 1000;
  const query = {
    service: 'WFS', version: '2.0.0', request: 'GetFeature',
    typeNames: 'kasai:' + name.replace('-', '_'), outputFormat: 'application/json',
    srsName: 'http://www.opengis.net/def/crs/OGC/1.3/CRS84', sortBy: 'cle A', count: pageSize,
  };
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  const features = [];
  const seen = new Set();
  do {
    url.searchParams.set('startIndex', features.length);
    const page = await fetchCollection(url, name);
    for (const item of page.features) {
      const key = item.properties?.cle;
      if (key == null || seen.has(key)) throw new Error(name + ' · clé WFS manquante ou répétée');
      seen.add(key);
      features.push(item);
    }
    const total = Number(page.numberMatched ?? page.totalFeatures ?? NaN);
    if (Number.isFinite(total) && features.length >= total) break;
    if (!page.features.length) {
      if (Number.isFinite(total)) throw new Error(name + ' · pagination WFS incomplète');
      break;
    }
    if (!Number.isFinite(total) && page.features.length < pageSize) break;
  } while (true);
  collections[name] = { type: 'FeatureCollection', features };
}

function setupProvinceLabels(provinces, kasai) {
  const group = L.layerGroup().addTo(map);
  const labelContext = document.createElement('canvas').getContext('2d');
  labelContext.font = '700 12px system-ui';
  const ordered = [kasai, ...provinces.filter((feature) => feature !== kasai)];
  function refresh() {
    group.clearLayers();
    const visible = map.hasLayer(layers.rdc) ? ordered : map.hasLayer(layers.kasai) ? [kasai] : [];
    const occupied = [];
    const size = map.getSize();
    for (const { properties: { nom, etiquette } } of visible) {
      const latlng = L.GeoJSON.coordsToLatLng(etiquette);
      const p = map.latLngToContainerPoint(latlng);
      const half = labelContext.measureText(nom).width / 2 + 7;
      if (p.x - half < 0 || p.x + half > size.x || p.y < 10 || p.y > size.y - 10 ||
          occupied.some(({ x, y, width }) => Math.abs(y - p.y) < 20 && Math.abs(x - p.x) < width + half)) continue;
      occupied.push({ x: p.x, y: p.y, width: half });
      const label = document.createElement('span');
      label.textContent = nom;
      group.addLayer(L.tooltip({
        permanent: true, direction: 'center', opacity: 1,
        className: nom === 'Kasaï' ? 'province-label kasai-label' : 'province-label',
      }).setLatLng(latlng).setContent(label));
    }
  }
  map.on('moveend resize', refresh);
  for (const layer of [layers.rdc, layers.kasai]) layer.on('add remove', refresh);
}

try {
  const water = load('cours-eau').catch((error) => error);
  const places = load('localites').catch((error) => error);
  const national = load('rdc').catch((error) => error);
  await Promise.all(['unites', 'permis'].map(load));
  layers.unites = L.geoJSON(null, {
    style: styles.unites,
    onEachFeature: ({ properties: p }, layer) => {
      const content = () => details(p.nom, [['Couche', 'Unité administrative'], ['Province', p.province]]);
      bindHoverCard(layer, content);
      layer.bindPopup(content, featurePopupOptions);
    },
  });
  layers.permis = L.geoJSON(null, {
    style: ({ properties: p }) => ({
      color: colors[labels.indexOf(term(p))], weight: 1.4,
      fill: p.code !== 'ZIN29', fillOpacity: 0.47,
    }),
    onEachFeature: ({ properties: p }, layer) => {
      bindHoverCard(layer, () => permitHover(layer));
      layer.bindPopup(() => permitDetails(p), featurePopupOptions);
    },
  });
  map.createPane('hydro').style.zIndex = '410';
  map.createPane('titles').style.zIndex = '420';
  map.createPane('places').style.zIndex = '430';
  layers.permis.options.pane = 'titles';
  const properties = collections.permis.features.map((item) => item.properties);
  for (const [select, values] of [
    ['status', properties.map((p) => p.statut)],
    ['type', properties.map((p) => p.type)],
  ]) {
    options(select, [...new Set(values.filter(Boolean))].map((value) => [value, value]));
  }
  updateUnits();
  Object.keys(layers).forEach(showLayer);
  const tools = window.outilsCarte(map, form);
  render(true);
  window.cartographie(map, layers, labels, colors);
  form.addEventListener('input', (event) => {
    render(event.target.name === 'unit');
  });
  form.addEventListener('reset', () => requestAnimationFrame(() => { updateUnits(); render(true); }));
  get('map-search').addEventListener('input', () => render());
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const bounds = L.geoJSON(render()).getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { maxZoom: 14, padding: [32, 32] });
  });
  get('map-search').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  const failure = await water;
  if (failure) {
    toggleFor('cours-eau').checked = false;
    toggleFor('cours-eau').disabled = true;
    get('load-error').textContent = 'Couche des cours d’eau indisponible. ' + failure.message;
    get('load-error').hidden = false;
  } else {
    layers['cours-eau'] = L.geoJSON(null, { style: styles['cours-eau'], pane: 'hydro', onEachFeature: ({ properties: p }, layer) => {
      if (p.etiquette) {
        const label = document.createElement('span');
        label.textContent = (p.nom_eau || 'Nom non renseigné') + (p.geometrie_approx ? ' (tracé reporté, approximatif)' : '');
        layer.bindTooltip(label, { permanent: true, className: 'water-label' });
      }
      const content = () => details(p.nom_eau || 'Cours d’eau sans nom renseigné', [
        ['Province', p.province], ['Unité administrative', p.nom],
        ['Ordre du cours d’eau', p.ordre],
        ['Tracé', p.geometrie_approx ? 'Reporté, approximatif' : undefined],
      ].filter(([, value]) => value != null));
      bindHoverCard(layer, content);
      layer.bindPopup(content, featurePopupOptions);
    } });
    showLayer('cours-eau');
    render();
  }
  if (await places) {
    toggleFor('localites').checked = false;
    toggleFor('localites').disabled = true;
    get('load-error').textContent += ' La couche des localités est indisponible.';
    get('load-error').hidden = false;
  } else {
    layers.localites = L.geoJSON(null, {
      pointToLayer: ({ properties: p }, latlng) => L.circleMarker(latlng, {
        pane: 'places', radius: p.chef_lieu ? 5 : 2.4, weight: 1, color: '#fff',
        fillColor: '#632d57', fillOpacity: 0.9,
      }),
      onEachFeature: ({ properties: p }, layer) => {
        if (p.chef_lieu) {
          const name = document.createElement('span');
          name.textContent = p.nom;
          layer.bindTooltip(name, { permanent: true, direction: 'right', className: 'place-label' });
        }
        const content = () => details(p.nom, [['Province', p.province], ['Unité administrative', p.unite], ['Source', 'GeoNames']]);
        bindHoverCard(layer, content);
        layer.bindPopup(content, featurePopupOptions);
      },
    });
    showLayer('localites');
    render();
  }
  const nationalFailure = await national;
  if (nationalFailure) {
    toggleFor('rdc').disabled = true;
    toggleFor('kasai').disabled = true;
    get('load-error').textContent += ' La couche des provinces de la RDC est indisponible.';
    get('load-error').hidden = false;
  } else {
    map.createPane('limites-rdc').style.zIndex = '390';
    const provinces = collections.rdc.features.filter(({ properties }) => properties.genre === 'province');
    const kasai = provinces.find(({ properties }) => properties.iso === 'CD-KS');
    const attribution = '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap</a> (ODbL)';
    function identifyProvince({ properties: p }, layer) {
      if (p.genre !== 'province') return;
      const content = () => details(p.nom, [['Niveau administratif', 'Province (ADM1)'], ['Pays', 'République démocratique du Congo']]);
      bindHoverCard(layer, content);
      layer.bindPopup(content, featurePopupOptions);
    }
    layers.rdc = L.geoJSON(collections.rdc, {
      pane: 'limites-rdc',
      style: ({ properties }) => styles.rdc[properties.genre],
      attribution,
      onEachFeature: identifyProvince,
    });
    layers.kasai = L.geoJSON(kasai, { pane: 'limites-rdc', style: styles.kasai, attribution, onEachFeature: identifyProvince });
    setupProvinceLabels(provinces, kasai);
    toggleFor('rdc').addEventListener('change', () => {
      if (toggleFor('rdc').checked) map.fitBounds(layers.rdc.getBounds().pad(0.06));
    });
    toggleFor('kasai').addEventListener('change', () => {
      if (toggleFor('kasai').checked) map.fitBounds(layers.kasai.getBounds().pad(0.08));
    });
    showLayer('rdc');
  }
  tools.restoreLink();
  updateEmptyMap();
} catch (error) {
  get('load-error').textContent = 'Les données cartographiques n’ont pas pu être chargées. ' + error.message;
  get('load-error').hidden = false;
}
