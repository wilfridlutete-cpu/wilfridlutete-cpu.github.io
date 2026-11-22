/* global L */
(() => {
  const get = (id) => document.getElementById(id);
  const ink = '#103c35';
  const sourceLabels = { provinces: 'Limites provinciales', unites: 'Unités administratives', 'cours-eau': 'Cours d’eau', localites: 'Localités' };
  const sourceColors = { provinces: '#21584e', unites: '#56766f', 'cours-eau': '#1884b6', localites: '#632d57' };
  const nasaCredit = 'NASA Earthdata / GIBS · Landsat WELD, composite annuel 2000 (fausses couleurs)';
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

  function drawVectors(ctx, layers, point, strokeScale, width, height) {
    const waterLabels = new Map();
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
          if (properties.nom_eau) {
            const segments = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
            const candidates = segments.flatMap((segment) => segment.filter((_, i) => i % 8 === 0).map(point));
            const anchor = candidates.find((p) => p.x > 20 && p.y > 20 && p.x < width - 160 && p.y < height - 20);
            if (anchor && !waterLabels.has(properties.nom_eau)) waterLabels.set(properties.nom_eau, anchor);
          }
        }
        if (style.fill) {
          ctx.globalAlpha = style.fillOpacity;
          ctx.fillStyle = style.fillColor || style.color;
          ctx.fill('evenodd');
        }
        ctx.globalAlpha = style.opacity;
        ctx.strokeStyle = style.color;
        ctx.lineWidth = style.weight * strokeScale;
        ctx.setLineDash(style.dashArray ? style.dashArray.split(/[, ]+/).map((n) => Number(n) * strokeScale) : []);
        ctx.stroke();
      });
    }
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
    const occupied = [];
    ctx.font = 'italic 22px system-ui, sans-serif';
    for (const [name, p] of waterLabels) {
      const box = { x: p.x, y: p.y, w: ctx.measureText(name).width + 14 };
      if (occupied.some((q) => Math.abs(q.y - box.y) < 29 && q.x < box.x + box.w && box.x < q.x + q.w)) continue;
      occupied.push(box);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 5;
      ctx.strokeText(name, p.x, p.y);
      ctx.fillStyle = '#07527e';
      ctx.fillText(name, p.x, p.y);
    }
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

  function decorate(ctx, map, area, scale, width, height, items, scope, date, tileStatus, mapLeft, mapWidth, credit) {
    ctx.fillStyle = ink;
    ctx.font = 'bold 46px system-ui, sans-serif';
    ctx.fillText('Périmètres miniers', 54, 68);
    ctx.font = '28px system-ui, sans-serif';
    ctx.fillText(scope, 54, 110, width - 108);
    ctx.strokeStyle = ink;
    ctx.lineWidth = 2;
    ctx.strokeRect(mapLeft, 145, mapWidth, height);

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
    ctx.fillText('Légende', 54, footer + 53);
    ctx.font = '25px system-ui, sans-serif';
    items.forEach(([text, color], index) => {
      const x = 54 + (index % 3) * ((width - 108) / 3);
      const y = footer + 93 + 43 * Math.floor(index / 3);
      ctx.fillStyle = color;
      ctx.fillRect(x, y - 18, 32, 18);
      ctx.fillStyle = ink;
      ctx.fillText(text, x + 44, y, (width - 108) / 3 - 56);
    });
    const sourceY = footer + 106 + 43 * Math.max(1, Math.ceil(items.length / 3));
    ctx.font = '22px system-ui, sans-serif';
    ctx.fillText('Sources : périmètres fournis · OCHA / RGC · HydroRIVERS · © OpenStreetMap · GeoNames', 54, sourceY, width - 108);
    const tileNote = {
      complete: 'Fond : ' + credit,
      partial: 'Fond partiel : ' + credit,
      unavailable: 'Fond indisponible à l’export : ' + credit,
      absent: 'Projection Web Mercator · échelle indicative au centre de la zone.',
    };
    ctx.fillText(tileNote[tileStatus], 54, sourceY + 32, width - 108);
    ctx.fillText('Édité par Wilfrid Lutete · wilfridlutete-cpu.github.io', 54, sourceY + 63, width - 108);
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

  function pdfFromImage(image, width, height) {
    const pageWidth = width >= height ? 842 : 595;
    const pageHeight = width >= height ? 595 : 842;
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
    const nasa = get('nasa');
    const esri = get('esri');
    const osmStatus = get('osm-status');
    const remote = ['http:', 'https:'].includes(location.protocol);
    osm.disabled = !remote;
    osm.checked = false;
    nasa.checked = false;
    esri.checked = remote;
    osmStatus.hidden = true;
    const tileUrl = document.querySelector('meta[name="osm-tiles"]')?.content || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
    const streets = remote ? L.tileLayer(tileUrl, {
      maxZoom: 19, crossOrigin: 'anonymous',
    }) : null;
    const satellite = L.tileLayer(
      'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/Landsat_WELD_CorrectedReflectance_Bands157_Global_Annual/default/2000-12-01/GoogleMapsCompatible_Level12/{z}/{y}/{x}.jpeg',
      { maxNativeZoom: 12, maxZoom: 19, crossOrigin: 'anonymous' },
    );
    const imagery = L.tileLayer(
      'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19, crossOrigin: 'anonymous' },
    );
    const backgrounds = [
      [osm, streets, osmCredit], [nasa, satellite, nasaCredit], [esri, imagery, esriCredit],
    ];
    let base = remote ? imagery : null;
    const satelliteCredits = new Map([
      [satellite, '<a href="https://www.earthdata.nasa.gov/data/tools/gibs">NASA GIBS</a> · Landsat WELD (2000)'],
      [imagery, '<a href="https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9">Esri World Imagery</a> · ' + esriCredit],
    ]);
    const creditControl = L.control({ position: 'bottomleft' });
    creditControl.onAdd = () => {
      const element = L.DomUtil.create('div', 'satellite-credit');
      L.DomEvent.disableClickPropagation(element);
      return element;
    };
    creditControl.addTo(map);
    function updateCredit() {
      const element = creditControl.getContainer();
      element.innerHTML = satelliteCredits.get(base) || '';
      element.hidden = !element.innerHTML;
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
        const legend = active.map((name) => [sourceLabels[name], sourceColors[name]]);
        if (permits) labels.forEach((label, i) => legend.push([label, colors[i]]));
        if (!legend.length) legend.push(['Fond de carte', '#e9f1ed']);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        const ctx = canvas.getContext('2d');
        const fields = printPermit ? wrapFields(ctx, printPermit.fields, width - 108) : [];
        const footerHeight = 145 + mapHeight + 190 + 43 * Math.ceil(legend.length / 3);
        canvas.height = footerHeight + 32 + (fields.length ? 70 + 33 * fields.length : 0);
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, width, canvas.height);
        ctx.save();
        ctx.translate(mapLeft, 145);
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
        const visible = ['unites', 'provinces', 'cours-eau', 'permis', 'localites']
          .map((name) => layers[name]).filter((layer) => layer && map.hasLayer(layer));
        const point = ([lng, lat]) => map.project([lat, lng]).subtract(map.getPixelOrigin())
          .add(map.layerPointToContainerPoint([0, 0])).subtract(area.min).multiplyBy(scale);
        drawVectors(ctx, visible, point, Math.max(1.4, Math.min(3.8, scale)), mapWidth, mapHeight);
        ctx.restore();
        const form = get('filters').elements;
        const scope = ['Province du Kasaï', form.unit.value && form.unit.selectedOptions[0].text].filter(Boolean).join(' · ');
        const credit = backgrounds.find(([, layer]) => layer && layer === base)?.[2];
        const date = new Intl.DateTimeFormat('fr-FR', {
          timeZone: 'Africa/Lubumbashi', day: '2-digit', month: '2-digit', year: 'numeric',
        }).format(new Date());
        decorate(ctx, map, area, scale, width, mapHeight, legend, scope, date, tileStatus, mapLeft, mapWidth, credit);
        if (fields.length) {
          ctx.fillStyle = ink;
          ctx.font = 'bold 30px system-ui, sans-serif';
          ctx.fillText('Légende cadastrale · titre ' + printPermit.permit.code, 54, footerHeight + 31);
          ctx.font = '24px system-ui, sans-serif';
          fields.forEach((line, i) => ctx.fillText(line, 54, footerHeight + 67 + 33 * i, width - 108));
        }
        const image = await encode(canvas, kind === 'png' ? 'image/png' : 'image/jpeg');
        save(kind === 'png' ? image : pdfFromImage(image, width, canvas.height), 'carte-miniere-kasai.' + kind);
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
