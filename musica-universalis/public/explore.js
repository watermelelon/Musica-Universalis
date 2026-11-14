/* Musica Universalis — exploración para el app.js v8 adjunto.
 * Cargar como script CLÁSICO después de app.js (no type="module").
 * No modifica el archivo app.js. Usa sus variables léxicas globales.
 * Fine PNG: intensidad en gris (R=G=B), 0 negro, 255 blanco; alfa multiplica.
 * No representa concentración física. No aplica el corte 0.15 del concierto.
 */
(() => {
  'use strict';
  if (window.MUExplore) return;
  if (typeof buses === 'undefined' || typeof pad === 'undefined') {
    console.error('Carga explore.js después del app.js v8, como script clásico.');
    return;
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const labels = { seasalt: 'Sal marina', dust: 'Polvo', smoke: 'Humo', sulfate: 'Sulfatos' };
  const panel = document.createElement('section');
  panel.setAttribute('aria-label', 'Modo de escucha');
  panel.innerHTML = `
    <div style="display:flex;gap:.5rem;justify-content:center;flex-wrap:wrap;margin:1rem">
      <button id="mu-concert" aria-pressed="true">Concierto</button>
      <button id="mu-explore" aria-pressed="false">Explorar</button>
    </div>
    <div id="mu-tools" hidden>
      <p id="mu-help">Mueve el cursor para escuchar. Rueda o botones para zoom; arrastra para desplazar.
        Con teclado: flechas para explorar, +/− para zoom, Inicio para centrar y Escape para pausar.</p>
      <div style="display:flex;gap:1rem;justify-content:center;align-items:center;flex-wrap:wrap">
        <button id="mu-minus" aria-label="Alejar mapa">−</button>
        <output id="mu-zoom">1×</output>
        <button id="mu-plus" aria-label="Acercar mapa">+</button>
        <button id="mu-reset">Ver todo</button>
        <label>Ventana de escucha <input id="mu-radius" type="range" min="0" max="32" value="8">
          <output id="mu-radius-value">8 px</output></label>
        <label>Detalles pequeños <input id="mu-detail" type="range" min="0" max="100" value="65"></label>
        <label><input id="mu-drone" type="checkbox" checked> Drone suave</label>
      </div>
      <p id="mu-data" role="status"></p>
      <p id="mu-values"></p><p id="mu-live" role="status" aria-atomic="true"></p>
    </div>`;
  cv.before(panel);
  const $ = id => panel.querySelector('#' + id);
  const map = document.createElement('canvas');
  map.id = 'explore-map'; map.width = cv.width; map.height = cv.height;
  map.hidden = true; map.style.display = 'none'; map.style.touchAction = 'none';
  map.style.cursor = 'crosshair'; map.tabIndex = 0;
  map.setAttribute('role', 'group');
  map.setAttribute('aria-label', 'Exploración sonora del mapa de aerosoles');
  map.setAttribute('aria-describedby', 'mu-help');
  cv.after(map);
  const paint = map.getContext('2d');
  const live = $('mu-live');
  live.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)';
  const originalPlay = btn.onclick;
  const originalRecord = recBtn.onclick;
  const sources = [pad, arp, bells, bass, kick, hat, snare, crash, stab, riser];
  let mode = 'concert', running = false, busy = false, initialized = null, epoch = 0;
  let engine = null, snapshot = null, fine = null, fineAttempted = false;
  let point = { x: 0.5, y: 0.5 }, selected = false, zoom = 1, viewX = 0, viewY = 0;
  let pendingFrame = 0, announceTimer = 0, drag = null, pulse = 0;
  let values = Object.fromEntries(NAMES.map(n => [n, 0]));
  const set = (param, target, duration = 0.09, time = Tone.now()) => {
    param.cancelAndHoldAtTime(time);
    param.linearRampToValueAtTime(target, time + duration);
  };

  // Se inicializa una sola vez; la misma secuencia de arranque de v8, sin
  // iniciar Transport. Así Explorar puede ser el primer modo que se escuche.
  async function unlock() {
    await Tone.start();
    if (started) return;
    if (!initialized) initialized = (async () => {
      await reverb.generate();
      startDrone(); riser.start();
      Tone.Transport.scheduleRepeat(tick, '16n');
      started = true;
    })().catch(error => { initialized = null; throw error; });
    await initialized;
  }
  async function action(fn) {
    if (busy) return;
    if (!grid || !grid.layers || !presence.seasalt) {
      status.textContent = 'Espera a que termine de cargar data/grid.json.'; return;
    }
    busy = true; btn.disabled = true;
    $('mu-concert').disabled = $('mu-explore').disabled = true;
    try { await fn(); }
    catch (error) {
      console.error(error); pause();
      status.textContent = 'No se pudo iniciar la exploración: ' + error.message;
    } finally {
      busy = false; btn.disabled = false;
      $('mu-concert').disabled = $('mu-explore').disabled = false;
    }
  }

  function createEngine() {
    if (engine) return;
    // Copias con los mismos ajustes de oscilador/envolvente. Las notas del
    // concierto pendientes no pueden volver a disparar estas voces.
    const voices = {
      seasalt: new Tone.PolySynth(Tone.Synth, pad.get()),
      dust: new Tone.PolySynth(Tone.Synth, arp.get()),
      smoke: new Tone.MonoSynth(bass.get()),
      sulfate: new Tone.PolySynth(Tone.FMSynth, bells.get()),
    };
    const seaFilter = new Tone.Filter(600, 'lowpass');
    const seaChorus = new Tone.Chorus(3, 3.5, 0.6).start();
    const dustFilter = new Tone.Filter(3200, 'lowpass');
    const dustDelay = new Tone.PingPongDelay('8n.', 0.35);
    dustDelay.wet.value = 0.35;
    const gates = {};
    for (const n of NAMES) gates[n] = new Tone.Gain(0).connect(buses[n].input);
    voices.seasalt.chain(seaFilter, seaChorus, gates.seasalt);
    voices.dust.chain(dustFilter, dustDelay, gates.dust);
    voices.smoke.connect(gates.smoke); voices.sulfate.connect(gates.sulfate);
    voices.seasalt.volume.value = VOL.pad;
    voices.dust.volume.value = VOL.arp;
    voices.smoke.volume.value = VOL.bass;
    voices.sulfate.volume.value = VOL.bells;
    const clock = new Tone.Clock(time => {
      if (mode !== 'explore' || !running || !selected) return;
      const step = pulse++ % 8;
      const row = clamp(point.y, 0, 1);
      if (values.seasalt > 0 && step === 0) {
        const f = pick(row, 0, 1).f;
        voices.seasalt.triggerAttackRelease([f, f * 1.5, f * 2], 1.1, time, 0.65);
      }
      if (values.dust > 0 && step % 2 === 0) {
        const f = pick(row, 1, 2).f * [1, 1.25, 1.5, 1.25][step / 2];
        voices.dust.triggerAttackRelease(f, '16n', time, 0.7);
      }
      if (values.smoke > 0 && step % 4 === 0)
        voices.smoke.triggerAttackRelease(pick(row, -1, 1).f, '8n', time, 0.65);
      if (values.sulfate > 0 && step % 4 === 2)
        voices.sulfate.triggerAttackRelease(pick(row, 2, 2).f, '4n', time, 0.5);
    }, BPM / 60 * 4);
    engine = { voices, gates, clock, seaFilter, seaChorus, dustFilter, dustDelay };
  }

  function freezeConcert() {
    Tone.Transport.pause(Tone.immediate()); playing = false;
    snapshot = {
      volumes: sources.map(s => s.volume.value),
      buses: Object.fromEntries(Object.entries(buses).map(([n, b]) => [n, {
        level: b.levelGain.gain.value, pump: b.pumpGain.gain.value,
        input: b.input.gain.value, x: b.spatial.positionX.value, pan: b.stereo.pan.value,
      }])),
      drone: droneGain.gain.value, riser: riserGain.gain.value,
    };
    // Los eventos ya enviados al reloj de audio quedan inaudibles.
    sources.forEach(s => { s.volume.value = -Infinity; });
    pad.releaseAll(); arp.releaseAll(); bells.releaseAll(); stab.releaseAll(); bass.triggerRelease();
    set(riserGain.gain, 0); set(buses.drums.input.gain, 0);
    for (const n of NAMES) {
      const b = buses[n];
      set(b.levelGain.gain, 1); set(b.pumpGain.gain, 1);
      set(b.spatial.positionX, b.cfg.x); set(b.stereo.pan, b.cfg.pan);
    }
    set(buses.drone.pumpGain.gain, 1);
    updateDrone();
  }
  function restoreConcert() {
    if (!snapshot) return;
    sources.forEach((s, i) => { s.volume.value = snapshot.volumes[i]; });
    for (const [n, state] of Object.entries(snapshot.buses)) {
      const b = buses[n];
      set(b.levelGain.gain, state.level); set(b.pumpGain.gain, state.pump);
      set(b.input.gain, state.input); set(b.spatial.positionX, state.x); set(b.stereo.pan, state.pan);
    }
    set(droneGain.gain, snapshot.drone);
    // No se restaura un riser a medio camino; el próximo build-up lo inicia.
    snapshot = null;
  }
  function updateDrone() {
    if (mode === 'explore' && droneGain)
      set(droneGain.gain, running && $('mu-drone').checked ? 0.22 : 0);
  }
  function silence() {
    if (!engine) return;
    for (const n of NAMES) set(engine.gates[n].gain, 0);
  }
  function pause() {
    epoch++;
    running = false; selected = false;
    Tone.getDestination().mute = true;
    if (engine) { engine.clock.stop(); silence(); }
    if (mode === 'explore') {
      updateDrone(); btn.textContent = 'Activar exploración';
      status.textContent = 'Exploración en pausa.';
    } else if (playing) {
      Tone.Transport.pause(); playing = false;
      Tone.getDestination().mute = true; btn.textContent = 'Escuchar';
    }
    queuePaint();
  }
  async function enter() {
    const request = epoch;
    await unlock();
    if (document.hidden || request !== epoch) return;
    createEngine();
    if (mode !== 'explore') {
      mode = 'explore'; freezeConcert();
      cv.style.display = 'none'; map.hidden = false; map.style.display = 'block';
      $('mu-tools').hidden = false;
      $('mu-explore').setAttribute('aria-pressed', 'true');
      $('mu-concert').setAttribute('aria-pressed', 'false');
      if (rhythmEl) rhythmEl.disabled = true;
      if (dropEl) dropEl.disabled = true;
      if (dynEl) dynEl.disabled = true;
    }
    running = true; selected = false; pulse = 0; silence();
    Tone.getDestination().mute = false;
    engine.clock.start(); updateDrone();
    btn.textContent = 'Pausar exploración';
    status.textContent = 'Explora el mapa. Flechas o puntero para escuchar; Escape pausa.';
    map.focus({ preventScroll: true });
    queuePaint();
    void loadFine();
  }
  function leave() {
    if (mode !== 'explore') return;
    pause(); restoreConcert(); mode = 'concert';
    Tone.getDestination().mute = true;
    cv.style.display = ''; map.hidden = true; map.style.display = 'none';
    $('mu-tools').hidden = true;
    $('mu-concert').setAttribute('aria-pressed', 'true');
    $('mu-explore').setAttribute('aria-pressed', 'false');
    if (rhythmEl) rhythmEl.disabled = false;
    if (dropEl) dropEl.disabled = false;
    if (dynEl) dynEl.disabled = false;
    btn.textContent = 'Escuchar'; status.textContent = 'Concierto listo. Pulsa Escuchar para continuar.';
  }

  async function loadFine() {
    if (fineAttempted) return;
    fineAttempted = true;
    $('mu-data').textContent = 'Leyendo mapas finos; mientras tanto se usa la cuadrícula ' + grid.cols + ' × ' + grid.rows + '.';
    try {
      if (!grid.fine?.files) throw new Error('El JSON no incluye fine.files.');
      const entries = await Promise.all(NAMES.map(async name => {
        const file = grid.fine.files[name];
        if (typeof file !== 'string') throw new Error('Falta fine.files.' + name);
        const image = new Image();
        image.crossOrigin = 'anonymous';
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Tiempo agotado: ' + file)), 15000);
          image.onload = () => { clearTimeout(timer); resolve(); };
          image.onerror = () => { clearTimeout(timer); reject(new Error('No se pudo abrir ' + file)); };
          image.src = file;
        });
        const w = image.naturalWidth, h = image.naturalHeight;
        if (w !== grid.fine.w || h !== grid.fine.h) throw new Error('Dimensiones inesperadas en ' + file);
        const off = document.createElement('canvas'); off.width = w; off.height = h;
        const context = off.getContext('2d', { willReadFrequently: true });
        context.drawImage(image, 0, 0);
        const rgba = context.getImageData(0, 0, w, h).data;
        const data = new Uint8Array(w * h);
        for (let p = 0, i = 0; p < data.length; p++, i += 4) {
          if (rgba[i + 3] && (rgba[i] !== rgba[i + 1] || rgba[i] !== rgba[i + 2]))
            throw new Error(file + ' debe ser una máscara de intensidad en escala de grises.');
          data[p] = Math.round(rgba[i] * rgba[i + 3] / 255);
        }
        off.width = off.height = 1;
        return [name, { data, w, h }];
      }));
      fine = Object.fromEntries(entries);
      $('mu-data').textContent = `Detalle fino activo: ${grid.fine.w} × ${grid.fine.h}. Valores visuales, no concentración física.`;
    } catch (error) {
      console.warn('Exploración sin mapas finos:', error);
      $('mu-data').textContent = `Detalle fino no disponible: ${error.message} Se usa la cuadrícula ${grid.cols} × ${grid.rows}.`;
    }
    queuePaint();
  }

  // La ventana tiene radio constante en píxeles de pantalla: al ampliar
  // abarca menos datos. Incluye TODOS los píxeles, no solamente los máximos.
  function sample(x, y, rx, ry) {
    const result = {};
    for (const n of NAMES) {
      const layer = fine?.[n];
      const w = layer ? layer.w : grid.cols, h = layer ? layer.h : grid.rows;
      const x0 = clamp(Math.floor((x - rx) * w), 0, w - 1);
      const x1 = clamp(Math.floor((x + rx) * w), 0, w - 1);
      const y0 = clamp(Math.floor((y - ry) * h), 0, h - 1);
      const y1 = clamp(Math.floor((y + ry) * h), 0, h - 1);
      let sum = 0;
      for (let r = y0; r <= y1; r++) for (let c = x0; c <= x1; c++)
        sum += layer ? layer.data[r * w + c] / 255 : grid.layers[n][r][c];
      result[n] = sum / ((x1 - x0 + 1) * (y1 - y0 + 1));
    }
    return result;
  }
  function updateAudio() {
    if (!engine || !running || !selected) { silence(); return; }
    const detail = Number($('mu-detail').value) / 100;
    const exponent = 0.95 - detail * 0.65;
    for (const n of NAMES) {
      const v = values[n];
      // Cero sigue siendo silencio. No hay umbral 0.15 ni mínimo fijo de volumen.
      const gain = v > 0 ? Math.pow(clamp(v, 0, 1), exponent) : 0;
      set(engine.gates[n].gain, gain * 0.8);
    }
    set(engine.seaFilter.frequency, 300 + 2500 * Math.sqrt(values.seasalt), 0.2);
  }
  function announce() {
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => { live.textContent = $('mu-values').textContent; }, 350);
  }
  function render() {
    pendingFrame = 0;
    if (mode !== 'explore') return;
    const rect = map.getBoundingClientRect();
    paint.clearRect(0, 0, map.width, map.height);
    const picture = highImage || img;
    if (picture?.complete && picture.naturalWidth)
      paint.drawImage(picture, viewX * picture.naturalWidth, viewY * picture.naturalHeight,
        picture.naturalWidth / zoom, picture.naturalHeight / zoom, 0, 0, map.width, map.height);
    if (grid && selected) {
      const radius = Number($('mu-radius').value);
      const rx = radius / Math.max(1, rect.width) / zoom;
      const ry = radius / Math.max(1, rect.height) / zoom;
      values = sample(point.x, point.y, rx, ry);
      const x = (point.x - viewX) * zoom * map.width, y = (point.y - viewY) * zoom * map.height;
      paint.strokeStyle = '#ffdc79'; paint.lineWidth = 2;
      paint.strokeRect(x - Math.max(2, radius * map.width / Math.max(1, rect.width)),
        y - Math.max(2, radius * map.height / Math.max(1, rect.height)),
        Math.max(4, 2 * radius * map.width / Math.max(1, rect.width)),
        Math.max(4, 2 * radius * map.height / Math.max(1, rect.height)));
      $('mu-values').textContent = NAMES.map(n => `${labels[n]}: ${values[n] === 0 ? '0' : values[n].toPrecision(3)}`).join(' · ');
      updateAudio();
    }
    $('mu-zoom').textContent = zoom.toFixed(1) + '×';
  }
  function queuePaint() { if (!pendingFrame) pendingFrame = requestAnimationFrame(render); }
  function clampView() {
    viewX = clamp(viewX, 0, 1 - 1 / zoom); viewY = clamp(viewY, 0, 1 - 1 / zoom);
  }
  function changeZoom(factor, sx = 0.5, sy = 0.5) {
    const x = viewX + sx / zoom, y = viewY + sy / zoom;
    zoom = clamp(zoom * factor, 1, 16);
    viewX = x - sx / zoom; viewY = y - sy / zoom; clampView();
    queuePaint();
  }
  function cursor(event) {
    const r = map.getBoundingClientRect();
    return { x: clamp((event.clientX - r.left) / r.width, 0, 1), y: clamp((event.clientY - r.top) / r.height, 0, 1) };
  }
  function selectAt(event) {
    const p = cursor(event);
    point = { x: clamp(viewX + p.x / zoom, 0, 1), y: clamp(viewY + p.y / zoom, 0, 1) };
    selected = true; queuePaint(); announce();
  }
  map.addEventListener('pointermove', event => {
    if (!running) return;
    if (drag && event.pointerId === drag.id) {
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (drag.moved || Math.hypot(dx, dy) > 5) {
        drag.moved = true;
        const r = map.getBoundingClientRect();
        viewX = drag.vx - dx / r.width / zoom; viewY = drag.vy - dy / r.height / zoom;
        clampView(); selected = false; silence(); queuePaint(); return;
      }
    }
    selectAt(event);
  });
  map.addEventListener('pointerdown', event => {
    if (!running || event.button !== 0) return;
    map.focus({ preventScroll: true });
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, vx: viewX, vy: viewY, moved: false };
    map.setPointerCapture(event.pointerId); selectAt(event);
  });
  map.addEventListener('pointerup', event => {
    if (!drag || event.pointerId !== drag.id) return;
    if (map.hasPointerCapture(event.pointerId)) map.releasePointerCapture(event.pointerId);
    drag = null;
    const r = map.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) {
      selected = false; silence(); queuePaint();
    } else if (running) selectAt(event);
  });
  for (const type of ['pointercancel', 'lostpointercapture']) map.addEventListener(type, () => {
    if (drag) { drag = null; selected = false; silence(); queuePaint(); }
  });
  map.addEventListener('pointerleave', () => { if (!drag) { selected = false; silence(); queuePaint(); } });
  map.addEventListener('blur', () => { selected = false; silence(); queuePaint(); });
  map.addEventListener('wheel', event => {
    if (mode !== 'explore') return;
    event.preventDefault();
    const p = cursor(event); changeZoom(event.deltaY < 0 ? 1.2 : 1 / 1.2, p.x, p.y);
    if (running) selectAt(event);
  }, { passive: false });
  map.addEventListener('keydown', event => {
    const moves = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (moves[event.key]) {
      event.preventDefault(); if (!running) return;
      if (!selected) point = { x: viewX + 0.5 / zoom, y: viewY + 0.5 / zoom };
      const [dx, dy] = moves[event.key], multiplier = event.shiftKey ? 10 : 1;
      point.x = clamp(point.x + dx * multiplier / (fine ? grid.fine.w : grid.cols), 0, 1);
      point.y = clamp(point.y + dy * multiplier / (fine ? grid.fine.h : grid.rows), 0, 1);
      if (point.x < viewX || point.x > viewX + 1 / zoom) viewX = point.x - 0.5 / zoom;
      if (point.y < viewY || point.y > viewY + 1 / zoom) viewY = point.y - 0.5 / zoom;
      clampView(); selected = true; queuePaint(); announce();
    } else if (['+', '=', '-'].includes(event.key)) {
      event.preventDefault(); changeZoom(event.key === '-' ? 1 / 1.4 : 1.4);
    } else if (event.key === 'Home') { event.preventDefault(); resetView(); }
    else if (event.key === 'Enter' || event.code === 'Space') {
      event.preventDefault();
      if (!running) void action(enter);
      else { selected = true; queuePaint(); announce(); }
    }
  });
  function resetView() { zoom = 1; viewX = viewY = 0; queuePaint(); }
  $('mu-plus').onclick = () => changeZoom(1.4);
  $('mu-minus').onclick = () => changeZoom(1 / 1.4);
  $('mu-reset').onclick = resetView;
  $('mu-radius').oninput = () => {
    $('mu-radius-value').textContent = $('mu-radius').value + ' px'; queuePaint();
  };
  $('mu-detail').oninput = () => updateAudio();
  $('mu-drone').onchange = updateDrone;
  $('mu-explore').onclick = () => action(enter);
  $('mu-concert').onclick = () => { if (!busy) leave(); };
  btn.onclick = () => action(async () => {
    if (mode === 'explore') { if (running) pause(); else await enter(); }
    else { const request = epoch; await unlock(); if (!document.hidden && request === epoch) await originalPlay.call(btn); }
  });
  // El grabador de v8 recibe la misma salida y funciona en ambos modos.
  recBtn.onclick = () => { if (!busy) return originalRecord.call(recBtn); };
  document.addEventListener('keydown', event => { if (event.key === 'Escape') pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  window.addEventListener('pagehide', pause);
  window.addEventListener('resize', queuePaint);

  // Opcional: <canvas id="map" ... data-explore-image="img/aerosols-8k.png">.
  // Solo cambia la vista de Explorar; el concierto conserva su imagen.
  let highImage = null;
  if (cv.dataset.exploreImage) {
    const high = new Image();
    high.onload = () => { highImage = high; queuePaint(); };
    high.onerror = () => console.warn('No se pudo abrir la imagen de zoom; se usará img/aerosols.jpg.');
    high.src = cv.dataset.exploreImage;
  }
  window.MUExplore = Object.freeze({
    enter: () => action(enter), leave: () => { if (!busy) leave(); }, pause,
    retryFine: () => { fineAttempted = false; return loadFine(); },
    getState: () => ({ mode, running, zoom, point: { ...point }, values: { ...values }, fine: !!fine }),
  });
})();
