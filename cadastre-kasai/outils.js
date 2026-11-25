(() => {
  const get = (id) => document.getElementById(id);
  const number = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

  function download(content, type, name) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function signedArea(points) {
    const radians = Math.PI / 180;
    const sum = points.reduce((total, point, i) => {
      const next = points[(i + 1) % points.length];
      const longitude = (next.lng - point.lng + 540) % 360 - 180;
      return total + longitude * radians * (Math.sin(point.lat * radians) + Math.sin(next.lat * radians));
    }, 0);
    return -sum * L.CRS.Earth.R ** 2 / 2;
  }

  window.outilsCarte = (map, form) => {
    const workspace = get('workspace');
    const panelButtons = [...document.querySelectorAll('[data-panel]')];
    const print = get('print-tools');
    const exportTabs = [...print.querySelectorAll('[data-export-tab]')];
    const exportViews = [...print.querySelectorAll('[data-export-view]')];
    const controls = [...document.querySelectorAll('[data-layer], #osm, #esri, #nasa')];
    const saved = get('saved-views');
    const narrow = matchMedia('(max-width: 740px)');
    const drawings = L.featureGroup().addTo(map);
    const measures = L.featureGroup().addTo(map);
    const sketchStyle = { color: '#f2c768', weight: 4, fillOpacity: 0.22, interactive: false };
    let activePanel;
    let exportTab = 'export';
    let mode;
    let points = [];
    let preview;
    let visiblePermits = [];
    let reportPermit;
    let elevationRequest;

    const status = (message) => {
      const output = get('map-action-status');
      output.textContent = message;
      output.hidden = !message;
    };

    const catalogue = get('catalogue');
    const catalogueSearch = get('catalogue-search');
    const catalogueEntries = controls.map((input) => {
      const row = document.createElement('label');
      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      const label = input.closest('label').textContent.trim();
      row.append(toggle, label);
      toggle.addEventListener('change', () => {
        input.checked = toggle.checked;
        input.dispatchEvent(new Event('change'));
        refreshCatalogue();
      });
      get('catalogue-layers').append(row);
      return { row, input, toggle, label };
    });
    const normalized = (text) => text.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
    function refreshCatalogue() {
      const query = normalized(catalogueSearch.value.trim());
      for (const { row, input, toggle, label } of catalogueEntries) {
        row.hidden = !normalized(label).includes(query);
        toggle.checked = input.checked;
        toggle.disabled = input.disabled;
      }
      get('catalogue-empty').hidden = catalogueEntries.some(({ row }) => !row.hidden);
    }
    get('open-catalogue').addEventListener('click', () => {
      catalogueSearch.value = '';
      refreshCatalogue();
      catalogue.showModal();
      catalogueSearch.focus();
    });
    catalogueSearch.addEventListener('input', refreshCatalogue);

    function snapshot() {
      const center = map.getCenter();
      return {
        center: [Number(center.lat.toFixed(6)), Number(center.lng.toFixed(6))],
        zoom: map.getZoom(),
        filters: Object.fromEntries(new FormData(form)),
        layers: Object.fromEntries(controls.map((input) => [input.id || input.dataset.layer, input.checked])),
      };
    }

    function restore(view) {
      const center = view?.center;
      if (!Array.isArray(center) || center.length !== 2 || !center.every(Number.isFinite) ||
          Math.abs(center[0]) > 85 || Math.abs(center[1]) > 180 ||
          !Number.isInteger(view.zoom) || view.zoom < 0 || view.zoom > map.getMaxZoom()) return false;
      for (const name of ['search', 'unit', 'status', 'term', 'type', 'from', 'to']) {
        const field = form.elements.namedItem(name);
        const value = view.filters?.[name];
        if (typeof value !== 'string') continue;
        if (field.tagName === 'SELECT' && ![...field.options].some((option) => option.value === value)) continue;
        field.value = value;
      }
      for (const input of controls) {
        const checked = view.layers?.[input.id || input.dataset.layer];
        if (typeof checked !== 'boolean' || input.disabled || checked === input.checked) continue;
        input.checked = checked;
        input.dispatchEvent(new Event('change'));
      }
      form.dispatchEvent(new Event('input'));
      map.setView(center, view.zoom);
      return true;
    }

    function share() {
      if (location.protocol === 'file:') {
        get('share-url').value = '';
        get('copy-view').disabled = true;
        get('share-status').textContent = 'Ouvrez le géoportail via HTTP ou HTTPS pour partager une vue.';
        return;
      }
      const url = new URL(location.href);
      url.searchParams.set('carte', JSON.stringify(snapshot()));
      get('share-url').value = url.href;
    }

    function showExportTab(name) {
      exportTab = name;
      for (const button of exportTabs) button.setAttribute('aria-pressed', String(button.dataset.exportTab === name));
      for (const view of exportViews) view.hidden = view.dataset.exportView !== name;
      if (name === 'share') share();
    }

    function openPanel(id) {
      if (activePanel && activePanel !== id && mode) {
        cancelSketch();
        status('');
      }
      if (activePanel === print.id && id !== print.id) map.fire('cancelexportdraft');
      if (id && narrow.matches && !get('sidebar').hidden) get('sidebar-toggle').click();
      activePanel = id;
      for (const button of panelButtons) {
        const panel = get(button.dataset.panel);
        const open = panel.id === id;
        button.setAttribute('aria-expanded', String(open));
        if (panel === print) panel.open = open;
        else panel.hidden = !open;
      }
      if (id === print.id && exportTab === 'share') share();
    }
    map.on('sidebaropened', () => { if (narrow.matches && activePanel) openPanel(); });

    for (const button of panelButtons) {
      button.setAttribute('aria-controls', button.dataset.panel);
      button.setAttribute('aria-expanded', 'false');
      button.addEventListener('click', () => openPanel(activePanel === button.dataset.panel ? undefined : button.dataset.panel));
    }
    for (const button of document.querySelectorAll('[data-close]')) {
      button.addEventListener('click', () => {
        panelButtons.find((tool) => tool.dataset.panel === activePanel)?.focus();
        openPanel();
      });
    }
    for (const button of exportTabs) button.addEventListener('click', () => showExportTab(button.dataset.exportTab));
    showExportTab('export');
    map.on('moveend', () => { if (activePanel === print.id && exportTab === 'share') share(); });
    form.addEventListener('input', () => { if (activePanel === print.id && exportTab === 'share') share(); });
    for (const input of controls) input.addEventListener('change', () => {
      if (activePanel === print.id && exportTab === 'share') queueMicrotask(share);
    });
    get('copy-view').addEventListener('click', async () => {
      share();
      try {
        await navigator.clipboard.writeText(get('share-url').value);
        get('share-status').textContent = 'Lien copié.';
      } catch {
        get('share-url').select();
        get('share-status').textContent = 'Copiez le lien sélectionné.';
      }
    });
    map.on('permitprint', ({ permit }) => {
      reportPermit = permit;
      showExportTab('export');
      openPanel(print.id);
    });
    get('clear-permit').addEventListener('click', () => { reportPermit = undefined; });
    map.on('permitsfiltered', ({ features }) => {
      visiblePermits = features;
      if (reportPermit && !features.some(({ properties }) => properties.cle === reportPermit.cle)) reportPermit = undefined;
      if (activePanel === print.id && exportTab === 'share') share();
    });
    get('download-report').addEventListener('click', () => {
      const permits = reportPermit ? [reportPermit] : [...new Map(visiblePermits.map(({ properties: p }) => [p.id, p])).values()];
      const rows = [
        ['Rapport', get('report-title').value.trim() || 'Rapport cadastral du Kasaï'],
        ['Description', get('report-description').value.trim()],
        ['Périmètre', reportPermit ? 'Permis joint' : 'Dossiers correspondant aux filtres'],
        [],
        ['Code', 'Titulaire', 'Type', 'Statut cadastral', 'Délivrance', 'Expiration'],
        ...permits.map((p) => [p.code, p.titulaire, p.type, p.statut, p.delivrance, p.expiration]),
      ];
      const cell = (value) => {
        const text = String(value ?? '');
        return '"' + (/^\s*[=+@-]/.test(text) ? "'" : '') + text.replaceAll('"', '""') + '"';
      };
      download('\ufeff' + rows.map((row) => row.map(cell).join(';')).join('\r\n'), 'text/csv;charset=utf-8', 'rapport-cadastral-kasai.csv');
    });
    get('download-permits').addEventListener('click', () => {
      const collection = { type: 'FeatureCollection', features: visiblePermits };
      download(JSON.stringify(collection), 'application/geo+json', 'permis-kasai.geojson');
    });

    const storageKey = 'kasai-cartes-v1';
    function savedViews() {
      return JSON.parse(localStorage.getItem(storageKey) || '[]');
    }
    function showSaved() {
      saved.replaceChildren();
      try {
        const views = savedViews();
        views.forEach(({ name, view }, index) => {
          const row = document.createElement('li');
          const load = document.createElement('button');
          load.textContent = name;
          load.addEventListener('click', () => { if (restore(view)) openPanel(); });
          const remove = document.createElement('button');
          remove.textContent = '×';
          remove.setAttribute('aria-label', 'Supprimer la vue ' + name);
          remove.addEventListener('click', () => {
            try {
              localStorage.setItem(storageKey, JSON.stringify(views.filter((_, i) => index !== i)));
              showSaved();
            } catch { get('saved-status').textContent = 'Impossible de mettre à jour les vues enregistrées.'; }
          });
          row.append(load, remove);
          saved.append(row);
        });
      } catch { get('saved-status').textContent = 'Le stockage local est indisponible.'; }
    }
    get('save-view').addEventListener('click', () => {
      const input = get('saved-name');
      try {
        const views = savedViews();
        views.push({ name: input.value.trim() || 'Vue ' + (views.length + 1), view: snapshot() });
        localStorage.setItem(storageKey, JSON.stringify(views));
        get('saved-status').textContent = 'Vue enregistrée.';
        input.value = '';
        showSaved();
      } catch { get('saved-status').textContent = 'Impossible d’enregistrer cette vue.'; }
    });
    showSaved();

    const modes = { distance: 2, area: 3, profile: 2, point: 1, line: 2, polygon: 3 };
    const isMeasurement = () => ['distance', 'area', 'profile'].includes(mode);
    const isPolygon = () => mode === 'area' || mode === 'polygon';
    const sketchButtons = [...document.querySelectorAll('[data-sketch]')];
    function cancelSketch() {
      preview?.remove();
      preview = undefined;
      points = [];
      mode = undefined;
      map.getContainer().classList.remove('map-sketch');
      for (const button of sketchButtons) button.setAttribute('aria-pressed', 'false');
    }
    function sketchLayer() {
      if (points.length === 1) return L.circleMarker(points[0], { ...sketchStyle, radius: 5, fillOpacity: 0.8 });
      return isPolygon() && points.length >= 3 ? L.polygon(points, sketchStyle) : L.polyline(points, sketchStyle);
    }
    function measurement() {
      const length = points.slice(1).reduce((total, point, index) => total + map.distance(points[index], point), 0);
      if (mode === 'area' && points.length >= 3) {
        const area = Math.abs(signedArea(points));
        const perimeter = length + map.distance(points.at(-1), points[0]);
        return number.format(area / 10000) + ' ha · ' + number.format(area / 1e6) + ' km²\nPérimètre ' + number.format(perimeter / 1000) + ' km';
      }
      if (mode === 'area') return 'Placez au moins trois sommets.';
      if (mode === 'profile') return 'Terminez le tracé pour calculer le profil.';
      return number.format(length) + ' m · ' + number.format(length / 1000) + ' km';
    }
    function drawProfile(values, distance) {
      const chart = get('elevation-chart');
      const ctx = chart.getContext('2d');
      const min = Math.floor(Math.min(...values) / 10) * 10;
      const max = Math.max(min + 10, Math.ceil(Math.max(...values) / 10) * 10);
      const left = 68;
      const right = chart.width - 36;
      const top = 20;
      const bottom = chart.height - 40;
      ctx.clearRect(0, 0, chart.width, chart.height);
      ctx.font = '17px system-ui';
      ctx.fillStyle = '#18352e';
      ctx.strokeStyle = '#d8ded1';
      for (let i = 0; i <= 4; i++) {
        const y = top + (bottom - top) * i / 4;
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(right, y);
        ctx.stroke();
        ctx.fillText(number.format(max - (max - min) * i / 4) + ' m', 4, y + 5, 61);
      }
      ctx.fillText('0 km', left, bottom + 24);
      ctx.textAlign = 'right';
      ctx.fillText(number.format(distance / 1000) + ' km', right, bottom + 24);
      ctx.textAlign = 'left';
      ctx.beginPath();
      values.forEach((value, i) => {
        const x = left + (right - left) * i / (values.length - 1);
        const y = bottom - (bottom - top) * (value - min) / (max - min);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#15533f';
      ctx.stroke();
      ctx.lineWidth = 1;
      chart.hidden = false;
    }
    async function loadProfile(vertices) {
      const segments = vertices.slice(1).map((end, i) => ({
        start: vertices[i], end, length: map.distance(vertices[i], end),
      })).filter(({ length }) => length > 0);
      const distance = segments.reduce((total, segment) => total + segment.length, 0);
      const output = get('measurement');
      if (!distance) { output.textContent = 'Placez des sommets distincts.'; return; }
      const count = Math.max(2, Math.min(48, Math.ceil(distance / 90) + 1));
      let segmentIndex = 0;
      let startDistance = 0;
      const samples = Array.from({ length: count }, (_, i) => {
        const target = distance * i / (count - 1);
        while (segmentIndex < segments.length - 1 && target > startDistance + segments[segmentIndex].length) {
          startDistance += segments[segmentIndex].length;
          segmentIndex++;
        }
        const { start, end, length } = segments[segmentIndex];
        const fraction = (target - startDistance) / length;
        const delta = (end.lng - start.lng + 540) % 360 - 180;
        return L.latLng(start.lat + (end.lat - start.lat) * fraction, start.lng + delta * fraction).wrap();
      });
      elevationRequest?.abort();
      const request = new AbortController();
      elevationRequest = request;
      output.textContent = 'Chargement du profil altimétrique…';
      try {
        const url = new URL('https://api.open-meteo.com/v1/elevation');
        url.searchParams.set('latitude', samples.map(({ lat }) => lat.toFixed(5)).join(','));
        url.searchParams.set('longitude', samples.map(({ lng }) => lng.toFixed(5)).join(','));
        const response = await fetch(url, { signal: AbortSignal.any([request.signal, AbortSignal.timeout(10000)]) });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const { elevation } = await response.json();
        if (!Array.isArray(elevation) || elevation.length !== count || !elevation.every(Number.isFinite)) throw new Error('Profil incomplet');
        if (request.signal.aborted) return;
        drawProfile(elevation, distance);
        output.textContent = 'Altitude de ' + number.format(Math.min(...elevation)) + ' à ' +
          number.format(Math.max(...elevation)) + ' m · Distance ' + number.format(distance / 1000) + ' km';
      } catch {
        if (!request.signal.aborted) output.textContent = 'Profil indisponible. Vérifiez votre connexion et réessayez.';
      }
    }
    function finishSketch() {
      if (!mode || points.length < modes[mode]) {
        status(mode ? 'Ajoutez des sommets pour terminer.' : 'Choisissez d’abord un outil.');
        return;
      }
      if (isPolygon() && signedArea(points) < 0) points.reverse();
      (isMeasurement() ? measures : drawings).addLayer(sketchLayer());
      if (mode === 'profile') void loadProfile(points);
      if (!isMeasurement()) get('drawing-status').textContent = 'Dessin ajouté.';
      cancelSketch();
      status('');
    }
    for (const button of sketchButtons) {
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => {
        cancelSketch();
        map.fire('cancelexportdraft');
        mode = button.dataset.sketch;
        if (isMeasurement()) {
          elevationRequest?.abort();
          measures.clearLayers();
          get('elevation-chart').hidden = true;
          get('elevation-source').hidden = mode !== 'profile';
          get('measurement').textContent = measurement();
        }
        button.setAttribute('aria-pressed', 'true');
        map.closePopup();
        map.getContainer().classList.add('map-sketch');
        status('Cliquez sur la carte pour placer un sommet.');
      });
    }
    get('select-area').addEventListener('click', cancelSketch);
    for (const button of document.querySelectorAll('[data-finish]')) button.addEventListener('click', finishSketch);
    for (const button of document.querySelectorAll('[data-clear]')) button.addEventListener('click', () => {
      const measure = button.closest('#measure-tools');
      cancelSketch();
      (measure ? measures : drawings).clearLayers();
      if (measure) {
        elevationRequest?.abort();
        get('elevation-chart').hidden = true;
        get('elevation-source').hidden = true;
      }
      get(measure ? 'measurement' : 'drawing-status').textContent = measure ? 'Aucune mesure.' : 'Dessins effacés.';
      status('');
    });
    map.getContainer().addEventListener('click', (event) => {
      if (!mode || event.target.closest('.leaflet-control, .leaflet-popup')) return;
      event.stopPropagation();
      points.push(map.mouseEventToLatLng(event).wrap());
      if (mode === 'point') { finishSketch(); return; }
      preview?.remove();
      preview = sketchLayer().addTo(map);
      if (isMeasurement()) get('measurement').textContent = measurement();
    }, true);
    get('download-drawing').addEventListener('click', () => {
      if (!drawings.getLayers().length) {
        get('drawing-status').textContent = 'Terminez un dessin avant de l’exporter.';
        return;
      }
      download(JSON.stringify(drawings.toGeoJSON(), null, 2), 'application/geo+json', 'dessins-kasai.geojson');
    });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || catalogue.open) return;
      if (mode) {
        cancelSketch();
        status('');
      } else if (activePanel && !map.getContainer().classList.contains('map-selection')) {
        panelButtons.find((button) => button.dataset.panel === activePanel)?.focus();
        openPanel();
      }
    });
    map.on('mousemove', ({ latlng }) => {
      const { lng, lat } = latlng.wrap();
      get('coordinates').textContent = 'CRS84 · ' + lng.toFixed(5) + '°, ' + lat.toFixed(5) + '°';
    });
    const locate = get('locate');
    if (!navigator.geolocation) locate.hidden = true;
    locate.addEventListener('click', () => map.locate({ setView: true, maxZoom: 15 }));
    map.on('locationerror', () => status('Position indisponible. Vérifiez l’autorisation du navigateur.'));
    let locationMarker;
    map.on('locationfound', ({ latlng }) => {
      locationMarker?.remove();
      locationMarker = L.circleMarker(latlng, { radius: 7, color: '#fff', fillColor: '#1571ae', fillOpacity: 1 }).addTo(map);
      status('');
    });
    const fullscreen = get('fullscreen');
    if (!workspace.requestFullscreen) fullscreen.hidden = true;
    fullscreen.addEventListener('click', async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await workspace.requestFullscreen();
      } catch { status('Le plein écran est indisponible.'); }
    });
    document.addEventListener('fullscreenchange', () => {
      const label = document.fullscreenElement ? 'Quitter le plein écran' : 'Plein écran';
      fullscreen.title = label;
      fullscreen.setAttribute('aria-label', label);
    });
    return {
      restoreLink() {
        const encoded = new URLSearchParams(location.search).get('carte');
        if (!encoded) return;
        try {
          if (!restore(JSON.parse(encoded))) status('Ce lien de carte est invalide.');
        } catch { status('Ce lien de carte est invalide.'); }
      },
    };
  };
})();
