/* global L */
(() => {
  const get = (id) => document.getElementById(id);
  const ink = '#103c35';
  const sourceLabels = { rdc: 'Frontière de la RDC', kasai: 'Limite du Kasaï', unites: 'Unités administratives', 'cours-eau': 'Cours d’eau', localites: 'Localités' };
  const sourceColors = { rdc: '#fff', kasai: '#fff', unites: '#56766f', 'cours-eau': '#1884b6', localites: '#632d57' };
  const esriCredit = 'Esri, Vantor, Earthstar Geographics et la communauté SIG';
  const osmCredit = '© contributeurs OpenStreetMap · openstreetmap.org/copyright';

  function turn(a, b, c) {
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  }

  function validZone(points) {
    const [a, b, c, d] = points;
    const turns = [turn(a, b, c), turn(b, c, d), turn(c, d, a), turn(d, a, b)];
    if (turns.some((value) => Math.abs(value) < 0.01)) return false;
    const crosses = (p, q, r, s) => turn(p, q, r) * turn(p, q, s) < 0 && turn(r, s, p) * turn(r, s, q) < 0;
    return !crosses(a, b, c, d) && !crosses(b, c, d, a);
  }

  function trace(ctx, geometry, point) {
    const { type, coordinates } = geometry;
    const line = (positions, close) => {
      positions.forEach((position, index) => {
        const p = point(position);
        if (index === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      if (close) ctx.closePath();
    };
    switch (type) {
      case 'Polygon': coordinates.forEach((ring) => line(ring, true)); break;
      case 'MultiPolygon': coordinates.forEach((polygon) => polygon.forEach((ring) => line(ring, true))); break;
      case 'LineString': line(coordinates, false); break;
      case 'MultiLineString': coordinates.forEach((segment) => line(segment, false)); break;
    }
  }

  function strokeWithContrast(ctx, color, width) {
    if (color === '#fff') {
      ctx.strokeStyle = '#526a72';
      ctx.lineWidth = width + 2;
      ctx.stroke();
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  function drawVectors(ctx, layers, point, strokeScale, width, height) {
    const waterLabels = new Map();
    const permits = new Map();
    const provinces = new Map();
    const inFrame = (p) => p.x > 55 && p.y > 35 && p.x < width - 55 && p.y < height - 35;
    for (const layer of layers) {
      layer.eachLayer((path) => {
        const style = path.options;
        ctx.beginPath();
        const { geometry, properties } = path.feature;
        if (geometry.type === 'Point') {
          const p = point(geometry.coordinates);
          ctx.arc(p.x, p.y, style.radius * strokeScale, 0, 2 * Math.PI);
          if (properties.chef_lieu) {
            ctx.font = 'bold 25px system-ui, sans-serif';
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 6;
            ctx.strokeText(properties.nom, p.x + 20, p.y - 12);
            ctx.fillStyle = '#391d33';
            ctx.fillText(properties.nom, p.x + 20, p.y - 12);
          }
        } else {
          trace(ctx, geometry, point);
          if (properties.genre === 'province') {
            const anchor = point(properties.etiquette);
            if (inFrame(anchor)) provinces.set(properties.nom, anchor);
          }
          if (properties.nom_eau) {
            const segments = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
            for (const segment of segments) {
              for (let i = 1; i < segment.length; i++) {
                const a = point(segment[i - 1]);
                const b = point(segment[i]);
                const p = a.add(b).divideBy(2);
                const length = a.distanceTo(b);
                if (!inFrame(p) || length <= (waterLabels.get(properties.nom_eau)?.length || 0)) continue;
                const angle = Math.atan2(b.y - a.y, b.x - a.x);
                waterLabels.set(properties.nom_eau, { p, length, angle: Math.abs(angle) > Math.PI / 2 ? angle - Math.sign(angle) * Math.PI : angle });
              }
            }
          }
          if (properties.code && path.getBounds) {
            const bounds = path.getBounds();
            const center = path.getCenter();
            const p = point([center.lng, center.lat]);
            const size = point([bounds.getWest(), bounds.getNorth()]).distanceTo(point([bounds.getEast(), bounds.getSouth()]));
            if (inFrame(p) && size >= 48 && size > (permits.get(properties.code)?.size || 0)) {
              const { type, code } = properties;
              const text = type && !String(code).startsWith(type) ? type + ' ' + code : String(code);
              permits.set(code, { p, size, text });
            }
          }
        }
        if (style.fill) {
          ctx.globalAlpha = style.fillOpacity;
          ctx.fillStyle = style.fillColor || style.color;
          ctx.fill('evenodd');
        }
        if (style.stroke) {
          ctx.globalAlpha = style.opacity;
          ctx.setLineDash(style.dashArray ? style.dashArray.split(/[, ]+/).map((n) => Number(n) * strokeScale) : []);
          strokeWithContrast(ctx, style.color, style.weight * strokeScale);
        }
      });
    }
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
    const occupied = [];
    function label(text, p, angle, color) {
      const span = ctx.measureText(text).width + 14;
      const box = { x: p.x - span / 2, y: p.y, w: span };
      if (occupied.some((q) => Math.abs(q.y - box.y) < 34 && q.x < box.x + box.w && box.x < q.x + q.w)) return;
      occupied.push(box);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(angle);
      ctx.textAlign = 'center';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 6;
      ctx.strokeText(text, 0, -5);
      ctx.fillStyle = color;
      ctx.fillText(text, 0, -5);
      ctx.restore();
    }
    ctx.font = 'bold 24px system-ui, sans-serif';
    for (const { p, text } of [...permits.values()].sort((a, b) => b.size - a.size)) label(text, p, 0, '#39251d');
    for (const [name, anchor] of provinces) label(name, anchor, 0, '#244954');
    ctx.font = 'italic 23px system-ui, sans-serif';
    for (const [name, { p, angle }] of waterLabels) label(name, p, angle, '#07527e');
  }

  function drawTiles(ctx, map, base, area, scale) {
    if (!base || !map.hasLayer(base)) return 'absent';
    const origin = map.getContainer().getBoundingClientRect();
    let covered = 0;
    for (const tile of base.getContainer().querySelectorAll('img.leaflet-tile-loaded')) {
      const rect = tile.getBoundingClientRect();
      const x = rect.left - origin.left;
      const y = rect.top - origin.top;
      const width = Math.min(x + rect.width, area.max.x) - Math.max(x, area.min.x);
      const height = Math.min(y + rect.height, area.max.y) - Math.max(y, area.min.y);
      if (width <= 0 || height <= 0 || !tile.naturalWidth) continue;
      ctx.drawImage(tile, (x - area.min.x) * scale, (y - area.min.y) * scale, rect.width * scale, rect.height * scale);
      covered += width * height;
    }
    const size = area.getSize();
    if (!covered) return 'unavailable';
    return covered >= size.x * size.y * 0.99 ? 'complete' : 'partial';
  }

  function coordinateLabel(value, positive, negative) {
    const seconds = Math.round(Math.abs(value) * 3600);
    const pad = (n) => String(n).padStart(2, '0');
    return Math.floor(seconds / 3600) + '°' + pad(Math.floor(seconds / 60) % 60) + '′'
      + pad(seconds % 60) + '″ ' + (value >= 0 ? positive : negative);
  }

  function drawFrame(ctx, map, area, x, y, width, height) {
    ctx.strokeStyle = ink;
    ctx.lineWidth = 4;
    ctx.strokeRect(x, y, width, height);
    ctx.font = '21px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const t of [0.12, 0.37, 0.63, 0.88]) {
      const lng = map.containerPointToLatLng([area.min.x + t * area.getSize().x, area.min.y]).lng;
      const lat = map.containerPointToLatLng([area.min.x, area.min.y + t * area.getSize().y]).lat;
      const px = x + t * width;
      const py = y + t * height;
      ctx.beginPath();
      ctx.moveTo(px, y - 8);
      ctx.lineTo(px, y);
      ctx.moveTo(x - 8, py);
      ctx.lineTo(x, py);
      ctx.stroke();
      ctx.fillText(coordinateLabel(lng, 'E', 'O'), px, y - 12, width / 4 - 6);
      ctx.save();
      ctx.translate(x - 15, py);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(coordinateLabel(lat, 'N', 'S'), 0, 0, height / 4 - 6);
      ctx.restore();
    }
    ctx.textAlign = 'left';
  }

  function drawInset(ctx, province, extent, x, y, width, height) {
    if (!province?.getBounds().isValid() || width < 620 || height < 600) return;
    const geo = province.getBounds();
    const panelWidth = 240;
    const panelHeight = 325;
    const scale = Math.min(204 / (geo.getEast() - geo.getWest()), 265 / (geo.getNorth() - geo.getSouth()));
    const middle = geo.getCenter();
    const point = ([lng, lat]) => ({ x: x + panelWidth / 2 + (lng - middle.lng) * scale,
      y: y + 177 - (lat - middle.lat) * scale });
    ctx.fillStyle = '#fff';
    ctx.fillRect(x, y, panelWidth, panelHeight);
    ctx.strokeStyle = ink;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, panelWidth, panelHeight);
    ctx.fillStyle = ink;
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillText('Situation dans le Kasaï', x + 10, y + 27, panelWidth - 20);
    ctx.beginPath();
    province.eachLayer((layer) => trace(ctx, layer.feature.geometry, point));
    ctx.fillStyle = '#d3e9e2';
    ctx.fill('evenodd');
    ctx.stroke();
    const nw = point([Math.max(geo.getWest(), extent.getWest()), Math.min(geo.getNorth(), extent.getNorth())]);
    const se = point([Math.min(geo.getEast(), extent.getEast()), Math.max(geo.getSouth(), extent.getSouth())]);
    if (nw.x <= se.x && nw.y <= se.y) {
      ctx.strokeStyle = '#a93925';
      ctx.lineWidth = 4;
      ctx.strokeRect(nw.x, nw.y, Math.max(5, se.x - nw.x), Math.max(5, se.y - nw.y));
    }
  }

  function decorate(ctx, map, area, scale, width, height, items, scope, date, tileStatus, mapLeft, mapWidth, credit, province, layout) {
    ctx.fillStyle = ink;
    ctx.font = 'bold 46px system-ui, sans-serif';
    ctx.fillText(layout.title, 54, 58, width - 108);
    ctx.font = '28px system-ui, sans-serif';
    ctx.fillText(scope, 54, 96, width - 108);
    if (layout.description) {
      ctx.font = '22px system-ui, sans-serif';
      ctx.fillText(layout.description, 54, 127, width - 108);
    }
    ctx.fillStyle = ink;
    drawFrame(ctx, map, area, mapLeft, 151, mapWidth, height);
    drawInset(ctx, province, L.latLngBounds(map.containerPointToLatLng(area.min),
      map.containerPointToLatLng(area.max)), mapLeft + 18, 172, mapWidth, height);

    const northX = mapLeft + mapWidth - 53;
    ctx.fillStyle = '#fff';
    ctx.fillRect(northX - 38, 164, 76, 112);
    ctx.fillStyle = ink;
    ctx.font = 'bold 29px system-ui, sans-serif';
    ctx.fillText('N', northX - 11, 196);
    ctx.beginPath();
    ctx.moveTo(northX, 208);
    ctx.lineTo(northX - 18, 257);
    ctx.lineTo(northX, 247);
    ctx.lineTo(northX + 18, 257);
    ctx.closePath();
    ctx.fill();

    const middle = area.getCenter();
    const meters = map.distance(map.containerPointToLatLng(middle), map.containerPointToLatLng(middle.add([100, 0]))) / 100;
    const target = mapWidth * 0.16 * meters / scale;
    const magnitude = 10 ** Math.floor(Math.log10(target));
    const distance = (target / magnitude >= 5 ? 5 : target / magnitude >= 2 ? 2 : 1) * magnitude;
    const bar = distance / meters * scale;
    const by = 145 + height - 25;
    ctx.fillStyle = '#fff';
    ctx.fillRect(mapLeft + 18, by - 46, Math.max(bar + 32, 150), 60);
    ctx.fillStyle = ink;
    ctx.fillRect(mapLeft + 32, by - 4, bar, 5);
    ctx.fillRect(mapLeft + 32, by - 10, 3, 11);
    ctx.fillRect(mapLeft + 32 + bar - 3, by - 10, 3, 11);
    ctx.font = '24px system-ui, sans-serif';
    ctx.fillText(distance >= 1000 ? distance / 1000 + ' km' : distance + ' m', mapLeft + 32, by - 16);

    const footer = 145 + height;
    ctx.font = 'bold 30px system-ui, sans-serif';
    if (items.length) ctx.fillText('Légende', 54, footer + 53);
    ctx.font = '25px system-ui, sans-serif';
    items.forEach(([text, color, symbol], index) => {
      const x = 54 + (index % 3) * ((width - 108) / 3);
      const y = footer + 93 + 43 * Math.floor(index / 3);
      ctx.fillStyle = color;
      if (symbol === 'point') {
        ctx.beginPath();
        ctx.arc(x + 16, y - 7, 6, 0, 2 * Math.PI);
        ctx.fill();
      } else if (symbol) {
        ctx.setLineDash(symbol === 'dashed' ? [7, 4] : []);
        ctx.beginPath();
        ctx.moveTo(x, y - 8);
        ctx.lineTo(x + 32, y - 8);
        strokeWithContrast(ctx, color, 4);
        ctx.setLineDash([]);
      } else ctx.fillRect(x, y - 18, 32, 18);
      ctx.fillStyle = ink;
      ctx.fillText(text, x + 44, y, (width - 108) / 3 - 56);
    });
    const sourceY = footer + (items.length ? 106 + 43 * Math.ceil(items.length / 3) : 52);
    ctx.font = '22px system-ui, sans-serif';
    const sources = layout.national || province
      ? 'Limites RDC et provinces : © OpenStreetMap (ODbL) · CAMI · OCHA / RGC · HydroRIVERS · GeoNames'
      : 'Sources : périmètres fournis · cartes CAMI fournies · OCHA / RGC · HydroRIVERS · © OpenStreetMap · GeoNames';
    ctx.fillText(sources, 54, sourceY, width - 108);
    const tileNote = {
      complete: 'Fond : ' + credit,
      partial: 'Fond partiel : ' + credit,
      unavailable: 'Fond indisponible à l’export : ' + credit,
      absent: 'Fond : couches vectorielles du géoportail.',
    };
    ctx.fillText(tileNote[tileStatus], 54, sourceY + 32, width - 108);
    ctx.fillText('Édité par Wilfrid Lutete · wilfridlutete-cpu.github.io', 54, sourceY + 63, width - 108);
    const [pageW, pageH] = pageSize(width, ctx.canvas.height, layout);
    const printFactor = Math.min((pageW - 36) / width, (pageH - 36) / ctx.canvas.height);
    const denominator = Math.round(meters / scale / (printFactor * 0.0254 / 72));
    ctx.fillText('WGS 84 / Web Mercator (EPSG:3857) · Échelle ' + layout.paper + ' à 100 % ≈ 1:' + denominator.toLocaleString('fr-FR'), 54, sourceY + 94, width - 108);
    ctx.textAlign = 'right';
    ctx.fillText('Imprimé le ' + date, width - 54, ctx.canvas.height - 20);
    ctx.textAlign = 'left';
  }

  function wrapFields(ctx, fields, width) {
    ctx.font = '24px system-ui, sans-serif';
    return fields.flatMap(([label, value]) => {
      const lines = [];
      let line = '';
      for (const word of (label + ' : ' + (value || 'Non renseigné')).split(/\s+/)) {
        const next = line ? line + ' ' + word : word;
        if (line && ctx.measureText(next).width > width) {
          lines.push(line);
          line = word;
        } else line = next;
      }
      return [...lines, line];
    });
  }

  function save(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  function encode(canvas, type) {
    return new Promise((resolve, reject) => canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Le navigateur n’a pas pu encoder la carte.'));
    }, type, 0.95));
  }

  function pageSize(width, height, { paper, orientation }) {
    const millimeters = paper === 'A3' ? [297, 420] : [210, 297];
    const points = millimeters.map((mm) => Math.round(mm * 72 / 25.4));
    return orientation === 'landscape' || (orientation === 'auto' && width >= height) ? points.reverse() : points;
  }

  function pdfFromImage(image, width, height, layout) {
    const [pageWidth, pageHeight] = pageSize(width, height, layout);
    const factor = Math.min((pageWidth - 36) / width, (pageHeight - 36) / height);
    const w = width * factor;
    const h = height * factor;
    const commands = `q ${w} 0 0 ${h} ${(pageWidth - w) / 2} ${(pageHeight - h) / 2} cm /Im0 Do Q\n`;
    const chunks = [];
    const offsets = [0];
    let size = 0;
    const append = (part) => {
      chunks.push(part);
      size += typeof part === 'string' ? part.length : part.size;
    };
    const object = (...parts) => {
      offsets.push(size);
      append(`${offsets.length - 1} 0 obj\n`);
      parts.forEach(append);
      append('\nendobj\n');
    };
    append('%PDF-1.4\n');
    object('<< /Type /Catalog /Pages 2 0 R >>');
    object('<< /Type /Pages /Count 1 /Kids [3 0 R] >>');
    object(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
    object(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.size} >>\nstream\n`, image, '\nendstream');
    object(`<< /Length ${commands.length} >>\nstream\n`, commands, 'endstream');
    const index = size;
    append(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
    offsets.slice(1).forEach((offset) => append(`${String(offset).padStart(10, '0')} 00000 n \n`));
    append(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${index}\n%%EOF\n`);
    return new Blob(chunks, { type: 'application/pdf' });
  }

  window.cartographie = function setup(map, layers, labels, colors) {
    const osm = get('osm');
    const esri = get('esri');
    const osmStatus = get('osm-status');
    const remote = ['http:', 'https:'].includes(location.protocol);
    osm.disabled = !remote;
    osm.checked = false;
    osmStatus.hidden = true;
    const tileUrl = document.querySelector('meta[name="osm-tiles"]')?.content || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
    const streets = remote ? L.tileLayer(tileUrl, {
      maxZoom: 19, crossOrigin: 'anonymous',
    }) : null;
    const imagery = L.tileLayer(
      'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19, crossOrigin: 'anonymous' },
    );
    const backgrounds = [
      [osm, streets, osmCredit], [esri, imagery, esriCredit],
    ];
    let base = esri.checked ? imagery : null;
    const imageryCredit = '<a href="https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9">Esri World Imagery</a> · ' + esriCredit;
    let activeCredit;
    function updateCredit() {
      if (activeCredit) map.attributionControl.removeAttribution(activeCredit);
      activeCredit = base === imagery ? imageryCredit : undefined;
      if (activeCredit) map.attributionControl.addAttribution(activeCredit);
    }
    for (const [input, layer] of backgrounds) {
      if (!layer) continue;
      layer.on('loading', () => { if (layer === base) osmStatus.hidden = true; });
      layer.on('tileerror', () => {
        if (layer !== base) return;
        osmStatus.textContent = 'Certaines tuiles du fond sélectionné sont indisponibles.';
        osmStatus.hidden = false;
      });
      input.addEventListener('change', () => {
        base?.remove();
        base = input.checked ? layer : null;
        backgrounds.forEach(([other]) => { if (other !== input) other.checked = false; });
        osmStatus.hidden = true;
        base?.addTo(map);
        updateCredit();
      });
    }
    base?.addTo(map);
    updateCredit();

    const north = L.control({ position: 'topleft' });
    north.onAdd = () => {
      const el = L.DomUtil.create('div', 'north-indicator');
      el.setAttribute('aria-label', 'Nord');
      el.innerHTML = 'N<br>▲';
      return el;
    };
    north.addTo(map);

    const selectionPane = map.createPane('selection');
    selectionPane.style.zIndex = '450';
    const status = get('print-status');
    const select = get('select-area');
    const clear = get('clear-area');
    let choosing = false;
    let vertices = [];
    let selection;
    const selectionStyle = { pane: 'selection', color: '#0a5343', interactive: false };
    const draft = L.layerGroup().addTo(map);
    const guide = L.polyline([], {
      ...selectionStyle, weight: 2, opacity: 0.6, dashArray: '5 5',
    }).addTo(draft);
    const vertexMarker = (latlng) => L.circleMarker(latlng, {
      ...selectionStyle, radius: 5, weight: 2, fillColor: '#fff', fillOpacity: 1,
    });
    let printPermit;
    map.on('permitprint', ({ permit, fields }) => {
      printPermit = { permit, fields };
      get('print-tools').open = true;
      get('clear-permit').hidden = false;
      get('print-permit').textContent = 'Fiche jointe : titre ' + permit.code;
    });
    function clearPermit() {
      printPermit = undefined;
      get('clear-permit').hidden = true;
      get('print-permit').textContent = '';
    }
    get('clear-permit').addEventListener('click', clearPermit);
    map.on('permitsfiltered', ({ features }) => {
      if (printPermit && !features.some(({ properties }) => properties.cle === printPermit.permit.cle)) clearPermit();
    });
    function cancel() {
      choosing = false;
      vertices = [];
      draft.clearLayers().addLayer(guide.setLatLngs([]));
      select.textContent = 'Sélectionner une zone';
      select.setAttribute('aria-pressed', 'false');
      map.getContainer().classList.remove('map-selection');
      if (selection) {
        status.textContent = 'Zone sélectionnée.';
        clear.hidden = false;
      } else status.textContent = 'La vue affichée sera exportée.';
    }
    map.on('cancelexportdraft', () => { if (choosing) cancel(); });
    select.addEventListener('click', () => {
      if (choosing) { cancel(); return; }
      choosing = true;
      map.closePopup();
      select.textContent = 'Annuler la sélection';
      select.setAttribute('aria-pressed', 'true');
      map.getContainer().classList.add('map-selection');
      status.textContent = 'Placez le point 1 sur 4.';
    });
    clear.addEventListener('click', () => {
      selection?.layer.remove();
      selection = undefined;
      clear.hidden = true;
      cancel();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && choosing) cancel();
    });
    map.on('mousemove', ({ latlng }) => {
      if (choosing && vertices.length) {
        guide.setLatLngs([...vertices, latlng, ...(vertices.length === 3 ? [vertices[0]] : [])]);
      }
    });
    map.getContainer().addEventListener('click', (event) => {
      if (!choosing || event.target.closest('.leaflet-control')) return;
      event.stopPropagation();
      const latlng = map.mouseEventToLatLng(event);
      const points = [...vertices, latlng].map((point) => map.latLngToContainerPoint(point));
      const last = points.at(-1);
      if (points.slice(0, -1).some((point) => point.distanceTo(last) < 8)) {
        status.textContent = 'Éloignez le point ' + points.length + ' des points déjà placés.';
        return;
      }
      if (points.length === 3 && Math.abs(turn(...points)) < 0.01) {
        status.textContent = 'Placez le point 3 en dehors de la ligne des deux premiers points.';
        return;
      }
      if (points.length === 4 && !validZone(points)) {
        status.textContent = 'Placez le point 4 de façon à fermer la zone sans croiser les côtés.';
        return;
      }
      vertices.push(latlng);
      if (vertices.length < 4) {
        vertexMarker(latlng).addTo(draft);
        guide.setLatLngs(vertices);
        status.textContent = 'Placez le point ' + (vertices.length + 1) + ' sur 4.';
        return;
      }
      const polygon = L.polygon(vertices, {
        ...selectionStyle, dashArray: '5 5', weight: 2, fillOpacity: 0.06,
      });
      selection?.layer.remove();
      selection = { polygon, vertices, layer: L.layerGroup([polygon, ...vertices.map(vertexMarker)]).addTo(map) };
      cancel();
    }, true);

    async function exportMap(kind) {
      const png = get('png');
      const pdf = get('pdf');
      png.disabled = pdf.disabled = true;
      try {
        const view = L.bounds([0, 0], map.getSize());
        if (choosing) {
          status.textContent = 'Terminez la zone en plaçant quatre points avant l’export.';
          return;
        }
        const region = selection?.polygon.getBounds();
        const area = region ? L.bounds(map.latLngToContainerPoint(region.getNorthWest()),
          map.latLngToContainerPoint(region.getSouthEast())) : view;
        if (!view.contains(area)) {
          map.fitBounds(region, { padding: [24, 24], animate: false });
          status.textContent = 'La zone a été recentrée. Relancez l’export une fois le fond chargé.';
          return;
        }
        if (base?.isLoading() && map.hasLayer(base)) {
          status.textContent = 'Le fond de carte se charge. Réessayez dans un instant.';
          return;
        }
        const sizes = area.getSize();
        if (sizes.x < 12 || sizes.y < 12) {
          if (region) map.fitBounds(region, { padding: [24, 24], animate: false });
          status.textContent = 'La zone est trop petite à ce zoom. Agrandissez-la ou relancez l’export après recentrage.';
          return;
        }
        const scale = Math.min(3100 / sizes.x, 2700 / sizes.y);
        const mapWidth = Math.round(sizes.x * scale);
        const mapHeight = Math.round(sizes.y * scale);
        const width = Math.max(1800, mapWidth + 108);
        const mapLeft = (width - mapWidth) / 2;
        const active = Object.keys(sourceLabels).filter((name) => layers[name] && map.hasLayer(layers[name]));
        const permits = layers.permis && map.hasLayer(layers.permis);
        const symbols = { rdc: 'line', kasai: 'line', unites: 'dashed', 'cours-eau': 'line', localites: 'point' };
        const legend = active.map((name) => [sourceLabels[name], sourceColors[name], symbols[name]]);
        if (active.includes('rdc')) legend.push(['Autres limites provinciales', sourceColors.rdc, 'dashed'], [sourceLabels.kasai, sourceColors.kasai, 'line']);
        if (active.includes('cours-eau')) legend.push(['Tracé reporté des cartes CAMI (approx.)', sourceColors['cours-eau'], 'dashed']);
        if (permits) labels.forEach((label, i) => legend.push([label, colors[i]]));
        if (!legend.length) legend.push(['Fond de carte', '#e9f1ed']);
        if (!get('export-legend').checked) legend.length = 0;
        const layout = {
          title: get('export-title').value.trim() || 'Carte des titres miniers',
          description: get('export-description').value.trim().replace(/\s+/g, ' '),
          paper: get('export-paper').value,
          orientation: get('export-orientation').value,
          national: active.includes('rdc'),
        };
        const canvas = document.createElement('canvas');
        canvas.width = width;
        const ctx = canvas.getContext('2d');
        const fields = printPermit ? wrapFields(ctx, printPermit.fields, width - 108) : [];
        const footerHeight = 145 + mapHeight + 190 + 43 * Math.ceil(legend.length / 3);
        canvas.height = footerHeight + 65 + (fields.length ? 70 + 33 * fields.length : 0);
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, width, canvas.height);
        ctx.save();
        ctx.translate(mapLeft, 151);
        ctx.beginPath();
        ctx.rect(0, 0, mapWidth, mapHeight);
        ctx.clip();
        if (selection) {
          ctx.beginPath();
          selection.vertices.forEach((vertex, i) => {
            const point = map.latLngToContainerPoint(vertex).subtract(area.min).multiplyBy(scale);
            if (i === 0) ctx.moveTo(point.x, point.y);
            else ctx.lineTo(point.x, point.y);
          });
          ctx.closePath();
          ctx.clip();
        }
        ctx.fillStyle = '#e9f1ed';
        ctx.fillRect(0, 0, mapWidth, mapHeight);
        const tileStatus = drawTiles(ctx, map, base, area, scale);
        const visible = ['rdc', 'kasai', 'unites', 'cours-eau', 'permis', 'localites']
          .map((name) => layers[name]).filter((layer) => layer && map.hasLayer(layer));
        const point = ([lng, lat]) => map.project([lat, lng]).subtract(map.getPixelOrigin())
          .add(map.layerPointToContainerPoint([0, 0])).subtract(area.min).multiplyBy(scale);
        drawVectors(ctx, visible, point, Math.max(1.4, Math.min(3.8, scale)), mapWidth, mapHeight);
        ctx.restore();
        const form = get('filters').elements;
        const scope = layout.national ? 'République démocratique du Congo' :
          ['Province du Kasaï', form.unit.value && form.unit.selectedOptions[0].text].filter(Boolean).join(' · ');
        const credit = backgrounds.find(([, layer]) => layer && layer === base)?.[2];
        const date = new Intl.DateTimeFormat('fr-FR', {
          timeZone: 'Africa/Lubumbashi', day: '2-digit', month: '2-digit', year: 'numeric',
        }).format(new Date());
        decorate(ctx, map, area, scale, width, mapHeight, legend, scope, date, tileStatus, mapLeft, mapWidth, credit, layers.kasai, layout);
        if (fields.length) {
          ctx.fillStyle = ink;
          ctx.font = 'bold 30px system-ui, sans-serif';
          ctx.fillText('Légende cadastrale · titre ' + printPermit.permit.code, 54, footerHeight + 65);
          ctx.font = '24px system-ui, sans-serif';
          fields.forEach((line, i) => ctx.fillText(line, 54, footerHeight + 101 + 33 * i, width - 108));
        }
        const image = await encode(canvas, kind === 'png' ? 'image/png' : 'image/jpeg');
        save(kind === 'png' ? image : pdfFromImage(image, width, canvas.height, layout), 'carte-miniere-kasai.' + kind);
        status.textContent = 'Carte exportée.' + (tileStatus === 'partial' || tileStatus === 'unavailable' ? ' Le fond de carte est incomplet.' : '');
      } catch (error) {
        status.textContent = 'Export impossible. ' + error.message;
      } finally {
        png.disabled = pdf.disabled = false;
      }
    }

    for (const kind of ['png', 'pdf']) {
      get(kind).disabled = false;
      get(kind).addEventListener('click', () => exportMap(kind));
    }
  };
})();
