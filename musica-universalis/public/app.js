// v8: volumen según la cantidad de aerosol (por nota y por especie) + contraste ajustable

// ---- Raíz: el año terrestre llevado 32 octavas arriba (~136.10 Hz) ----
const EARTH_YEAR_S = 365.256 * 86400;
const ROOT = (1 / EARTH_YEAR_S) * 2 ** 32;
const KEPLER_EARTH = 16 / 15;
const KEPLER_SUSPENSION = true;

// ---- Ajustes ----
const BPM = 108;
const HIT_COUNT = 6;
const MIN_GAP = 10;
const TIER_GROOVE = 0.30;
const TIER_FULL = 0.60;
const SPATIAL_BOOST = 1.3;
const MOTION = 0.3;          // 0 = escenario totalmente fijo; 1 = deriva grande (mareante)
const SOLO_BACKING = 0.35;   // volumen de ritmo y drone cuando haces solo de una especie
const ENERGY_W = { seasalt: 1, dust: 1, smoke: 1, sulfate: 1 };  // peso de cada especie en la energía
const VOL = { pad: -16, arp: -14, bells: -18, bass: -10, stab: -14,
              kick: -6, hat: -26, snare: -18, crash: -22, riser: -26, drone: -24 };

let RHYTHM = 0.5;   // 0 = sin bombo ni hi-hats; 1 = completos
let DROP = 0.7;     // 0 = sin entradas; 1 = completas
let DYN = 0.7;      // contraste de volumen: 0 = casi plano; 1 = muy contrastado

Tone.Transport.bpm.value = BPM;

// ---- Volumen según cantidad ----
// norm: valor de celda (0.15-1) -> 0-1
const norm = v => Math.min(1, Math.max(0, (v - 0.15) / 0.85));
// dyn: 0-1 -> multiplicador de volumen entre (1-DYN) y 1
const dyn = (x, curve = 0.8) => (1 - DYN) + DYN * Math.pow(Math.min(1, Math.max(0, x)), curve);
// busLevel: nivel de cada especie en la columna (usa 3/4 del contraste para no exagerar con el de cada nota)
const busLevel = p => (1 - 0.75 * DYN) + 0.75 * DYN * Math.pow(Math.min(1, Math.max(0, p)), 0.8);

// ---- Escala consonante en razones justas (pentatónica) ----
const RATIOS = [[1, 1], [9, 8], [5, 4], [3, 2], [5, 3]];

function pick(rowFrac, octBase, span) {
  const n = RATIOS.length * span;
  const idx = Math.min(n - 1, Math.floor((1 - rowFrac) * n));
  const [num, den] = RATIOS[idx % RATIOS.length];
  const octave = Math.floor(idx / RATIOS.length) + octBase;
  return { f: ROOT * (num / den) * 2 ** octave, label: `${num}:${den}` };
}

// ---- Salida maestra ----
const limiter = new Tone.Limiter(-1).toDestination();
const master = new Tone.Compressor(-20, 3).connect(limiter);
const reverb = new Tone.Reverb({ decay: 8, wet: 1 }).connect(master);

// ---- Un bus por especie: estéreo y 3D en paralelo, solo uno suena a la vez ----
let spatialMode = true;

function makeBus(send, cfg) {
  const input = new Tone.Gain(1);
  const soloGain = new Tone.Gain(1);     // botones de solo
  const levelGain = new Tone.Gain(1);    // volumen según la cantidad de aerosol
  const pumpGain = new Tone.Gain(1);     // sidechain
  const stereo = new Tone.Panner(cfg.pan);
  const spatial = new Tone.Panner3D({
    panningModel: "HRTF", distanceModel: "inverse",
    refDistance: 1, rolloffFactor: 0.12,
    positionX: cfg.x, positionY: cfg.y, positionZ: cfg.z,
  });
  const outStereo = new Tone.Gain(spatialMode ? 0 : 1);
  const outSpatial = new Tone.Gain(spatialMode ? SPATIAL_BOOST : 0);
  const sendGain = new Tone.Gain(send);

  input.chain(soloGain, levelGain, pumpGain);
  pumpGain.connect(stereo);  stereo.connect(outStereo);
  pumpGain.connect(spatial); spatial.connect(outSpatial);
  outStereo.connect(master);  outSpatial.connect(master);
  outStereo.connect(sendGain); outSpatial.connect(sendGain);
  sendGain.connect(reverb);

  return { input, soloGain, levelGain, pumpGain, stereo, spatial, outStereo, outSpatial, cfg };
}

// ESCENARIO FIJO (metros: x = izquierda(-)/derecha(+), y = abajo(-)/arriba(+), z = frente (-))
const buses = {
  drums:   makeBus(0.12, { x: 0,    y: 0,    z: -2,   pan: 0,     drift: 0 }),
  drone:   makeBus(0.40, { x: 0,    y: -1.5, z: -3,   pan: 0,     drift: 0 }),
  smoke:   makeBus(0.15, { x: 0,    y: -2.5, z: -1.5, pan: 0,     drift: 1 }),
  seasalt: makeBus(0.55, { x: -4.5, y: 0.5,  z: -4,   pan: -0.65, drift: 3 }),
  dust:    makeBus(0.35, { x: 4.5,  y: 0.5,  z: -3.5, pan: 0.65,  drift: 3 }),
  sulfate: makeBus(0.60, { x: -1.5, y: 3,    z: -3,   pan: -0.2,  drift: 2 }),
};

function place(bus, lon, time) {
  const c = bus.cfg;
  const pan = Math.max(-1, Math.min(1, c.pan + lon * c.drift * MOTION * 0.15));
  bus.stereo.pan.rampTo(pan, 0.6, time);
  bus.spatial.positionX.rampTo(c.x + lon * c.drift * MOTION, 0.6, time);
}

// ---- SAL MARINA: pad espacial ----
const padFilter = new Tone.Filter(600, "lowpass");
const chorus = new Tone.Chorus(3, 3.5, 0.6).start();
const pad = new Tone.PolySynth(Tone.Synth, {
  oscillator: { type: "fatsawtooth", count: 3, spread: 28 },
  envelope: { attack: 1.5, decay: 0.5, sustain: 0.8, release: 4 },
});
pad.volume.value = VOL.pad;
pad.chain(padFilter, chorus, buses.seasalt.input);

// ---- POLVO: arpegio pwm con eco ping-pong ----
const arpDelay = new Tone.PingPongDelay("8n.", 0.35);
arpDelay.wet.value = 0.35;
const arpFilter = new Tone.Filter(3200, "lowpass");
const arp = new Tone.PolySynth(Tone.Synth, {
  oscillator: { type: "pwm", modulationFrequency: 0.4 },
  envelope: { attack: 0.005, decay: 0.18, sustain: 0, release: 0.3 },
});
arp.volume.value = VOL.arp;
arp.chain(arpFilter, arpDelay, buses.dust.input);

// ---- SULFATOS: campanas FM ----
const bells = new Tone.PolySynth(Tone.FMSynth, {
  harmonicity: 3.01, modulationIndex: 6,
  envelope: { attack: 0.01, decay: 1.4, sustain: 0, release: 2.5 },
});
bells.volume.value = VOL.bells;
bells.connect(buses.sulfate.input);

// ---- HUMO: bajo de sierra con filtro ----
const bass = new Tone.MonoSynth({
  oscillator: { type: "sawtooth" },
  envelope: { attack: 0.01, decay: 0.25, sustain: 0.4, release: 0.3 },
  filter: { Q: 3, type: "lowpass", rolloff: -24 },
  filterEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.2, release: 0.4, baseFrequency: 120, octaves: 3 },
});
bass.volume.value = VOL.bass;
bass.connect(buses.smoke.input);

// ---- Percusión y efectos (centro) ----
const kick = new Tone.MembraneSynth({
  pitchDecay: 0.04, octaves: 6,
  envelope: { attack: 0.001, decay: 0.35, sustain: 0, release: 0.1 },
});
kick.volume.value = VOL.kick;
kick.connect(buses.drums.input);

const hat = new Tone.NoiseSynth({ noise: { type: "white" },
  envelope: { attack: 0.001, decay: 0.05, sustain: 0 } });
hat.volume.value = VOL.hat;
hat.chain(new Tone.Filter(7000, "highpass"), buses.drums.input);

const snare = new Tone.NoiseSynth({ noise: { type: "white" },
  envelope: { attack: 0.001, decay: 0.14, sustain: 0 } });
snare.volume.value = VOL.snare;
snare.chain(new Tone.Filter(1500, "highpass"), buses.drums.input);

const crash = new Tone.NoiseSynth({ noise: { type: "white" },
  envelope: { attack: 0.002, decay: 1.6, sustain: 0 } });
crash.volume.value = VOL.crash;
crash.chain(new Tone.Filter(4500, "highpass"), buses.drums.input);

const stab = new Tone.PolySynth(Tone.Synth, {
  oscillator: { type: "fatsawtooth", count: 3, spread: 30 },
  envelope: { attack: 0.02, decay: 0.4, sustain: 0.3, release: 1.2 },
});
stab.volume.value = VOL.stab;
stab.chain(new Tone.Filter(2500, "lowpass"), buses.drums.input);

const riserFilter = new Tone.Filter(400, "bandpass");
const riserGain = new Tone.Gain(0);
const riser = new Tone.Noise("pink");
riser.volume.value = VOL.riser;
riser.chain(riserFilter, riserGain, buses.drums.input);

// ---- Drone: raíz, quinta (3:2) y octava ----
let droneGain;
function startDrone() {
  droneGain = new Tone.Gain(0.6).connect(buses.drone.input);
  const f = new Tone.Filter(400, "lowpass").connect(droneGain);
  [ROOT / 2, ROOT * 3 / 4, ROOT].forEach(fr => {
    const o = new Tone.Oscillator(fr, "sine");
    o.volume.value = VOL.drone;
    o.connect(f);
    o.start();
  });
  new Tone.LFO(1 / 60, 250, 700).connect(f.frequency).start();
}

// ---- Sidechain: los pads se agachan con cada bombo ----
function duck(time) {
  const depth = 1 - 0.7 * Math.min(1, RHYTHM * 1.4);
  for (const b of [buses.seasalt, buses.dust, buses.drone]) {
    const g = b.pumpGain.gain;
    g.cancelScheduledValues(time);
    g.setValueAtTime(depth, time);
    g.linearRampToValueAtTime(1, time + 0.28);
  }
}
function kickHit(time, vel) {
  if (RHYTHM < 0.03) return;
  kick.triggerAttackRelease(ROOT / 4, "8n", time, Math.min(1, vel * RHYTHM * 1.6));
  duck(time);
}

// ---- Datos ----
let grid, img;
let tops = {}, presence = {}, E = [], level = [], hits = new Set(), buildDist = new Map();
let lastLabel = "–";
const NAMES = ["seasalt", "dust", "smoke", "sulfate"];
const SHORT = { seasalt: "sal", dust: "polvo", smoke: "humo", sulfate: "sulfatos" };

function precompute() {
  for (const name of NAMES) {
    tops[name] = [];
    for (let c = 0; c < grid.cols; c++) {
      const arr = [];
      for (let r = 0; r < grid.rows; r++) {
        const v = grid.layers[name][r][c];
        if (v > 0.15) arr.push({ row: r, val: v });
      }
      arr.sort((a, b) => b.val - a.val);
      tops[name].push(arr.slice(0, 3));
    }
  }
}

// Presencia de cada especie por columna: cuánto aerosol hay en total (intensidad x extensión),
// normalizado por especie y suavizado. 0 = nada, 1 = lo más denso que tiene esa especie en el mapa.
function computePresence() {
  for (const name of NAMES) {
    const sums = [];
    for (let c = 0; c < grid.cols; c++) {
      let s = 0;
      for (let r = 0; r < grid.rows; r++) s += grid.layers[name][r][c];
      sums.push(s);
    }
    const sorted = [...sums].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(0.95 * (sorted.length - 1))] || 1;
    const raw = sums.map(s => Math.min(1, s / p95));
    presence[name] = raw.map((_, c) => {
      let t = 0, k = 0;
      for (let j = -1; j <= 1; j++) {
        const i = c + j;
        if (i >= 0 && i < raw.length) { t += raw[i]; k++; }
      }
      return t / k;
    });
  }
}

function computeEnergy() {
  const dens = [], mix = [];
  for (let c = 0; c < grid.cols; c++) {
    let sum = 0, n = 0;
    for (const name of NAMES) {
      let colSum = 0, mx = 0;
      for (let r = 0; r < grid.rows; r++) {
        const v = grid.layers[name][r][c];
        colSum += v;
        if (v > mx) mx = v;
      }
      sum += colSum * (ENERGY_W[name] ?? 1);
      if (mx > 0.15) n++;
    }
    dens.push(sum);
    mix.push(n);
  }
  const sorted = [...dens].sort((a, b) => a - b);
  const p95 = sorted[Math.floor(0.95 * (sorted.length - 1))] || 1;
  const raw = dens.map((d, c) =>
    Math.min(1, 0.6 * Math.min(1, d / p95) + 0.4 * Math.max(0, mix[c] - 1) / 3));
  E = raw.map((_, c) => {
    let s = 0, k = 0;
    for (let j = -1; j <= 1; j++) {
      const i = c + j;
      if (i >= 0 && i < raw.length) { s += raw[i]; k++; }
    }
    return s / k;
  });
}

function findHits() {
  const sorted = [...E].sort((a, b) => a - b);
  for (const pct of [0.7, 0.5, 0.3]) {
    const thr = sorted[Math.floor(pct * (sorted.length - 1))];
    const cands = [];
    for (let c = 0; c < E.length; c++) {
      let isMax = E[c] >= thr;
      for (let j = -3; j <= 3 && isMax; j++) {
        const i = c + j;
        if (i >= 0 && i < E.length && E[i] > E[c]) isMax = false;
      }
      if (isMax) cands.push(c);
    }
    cands.sort((a, b) => E[b] - E[a]);
    const chosen = [];
    for (const c of cands) {
      if (chosen.length >= HIT_COUNT) break;
      if (chosen.every(a => Math.abs(a - c) >= MIN_GAP)) chosen.push(c);
    }
    if (chosen.length >= 3) { hits = new Set(chosen); break; }
    hits = new Set(chosen);
  }
  console.log("Entradas en columnas:", [...hits].sort((a, b) => a - b));
}

function buildLevels() {
  const sorted = [...E].sort((a, b) => a - b);
  const lo = sorted[Math.floor(0.1 * (sorted.length - 1))];
  const hi = sorted[Math.floor(0.9 * (sorted.length - 1))];
  const span = (hi - lo) || 1;
  level = E.map(e => 0.08 + 0.6 * Math.min(1, Math.max(0, (e - lo) / span)));
  buildDist = new Map();
  for (const h of hits) {
    level[h] = 1;
    for (let k = 1; k <= 6; k++) {
      const i = (h + k) % grid.cols;
      level[i] = Math.max(level[i], 1 - 0.13 * k);
    }
    const prep = { 3: 0.35, 2: 0.45, 1: 0.2 };
    for (const j of [3, 2, 1]) {
      const i = (h - j + grid.cols) % grid.cols;
      level[i] = prep[j];
      buildDist.set(i, j);
    }
  }
}

// ---- Momentos especiales (escalan con el control "Entradas") ----
function startRiser(time, beat) {
  if (DROP < 0.03) return;
  riserGain.gain.cancelScheduledValues(time);
  riserGain.gain.setValueAtTime(0, time);
  riserGain.gain.linearRampToValueAtTime(DROP, time + beat * 3);
  riserFilter.frequency.cancelScheduledValues(time);
  riserFilter.frequency.setValueAtTime(300, time);
  riserFilter.frequency.exponentialRampToValueAtTime(6000, time + beat * 3);
}

function hitMoment(time, beat) {
  riserGain.gain.cancelScheduledValues(time);
  riserGain.gain.setValueAtTime(0, time);
  if (DROP < 0.03) return;
  const v = DROP;
  crash.triggerAttackRelease("2n", time, 0.8 * v);
  stab.triggerAttackRelease([ROOT * 2, ROOT * 2 * 5 / 4, ROOT * 2 * 3 / 2, ROOT * 4], "2n", time, 0.8 * v);
  bass.triggerAttackRelease(ROOT / 2, "2n", time, v);
  if (KEPLER_SUSPENSION) {
    bells.triggerAttackRelease(ROOT * 4 * KEPLER_EARTH, "8n", time, 0.5 * v);   // Fa (16:15)
    bells.triggerAttackRelease(ROOT * 4, "4n", time + beat, 0.5 * v);           // resuelve a Mi (1:1)
  }
}

function strongest(name, c0, n) {
  let best = null;
  for (let i = 0; i < n; i++) {
    const t = tops[name][(c0 + i) % grid.cols][0];
    if (t && (!best || t.val > best.val)) best = t;
  }
  return best;
}

function playPad(c, L, time) {
  const s = strongest("seasalt", c, 4);
  const idx = s ? Math.min(4, Math.floor((1 - s.row / grid.rows) * RATIOS.length)) : 0;
  const [num, den] = RATIOS[idx];
  const f = ROOT * (num / den);
  lastLabel = `${num}:${den}`;
  const chord = [f, f * 3 / 2, f * 2];
  if (L >= 0.5) chord.push(f * 5 / 4 * 2);
  // el pad suena fuerte donde hay mucha sal marina y casi no se oye donde no hay
  pad.triggerAttackRelease(chord, "1m", time, 0.75 * dyn(presence.seasalt[c], 1));
}

// ---- Secuenciador: cada columna = 1 pulso = 4 semicorcheas ----
let tickIdx = 0;

function tick(time) {
  const step = tickIdx % 4;
  const c = Math.floor(tickIdx / 4) % grid.cols;
  tickIdx++;

  const lon = (c / (grid.cols - 1)) * 2 - 1;
  const L = level[c];
  const dropOn = DROP >= 0.03;
  const k = dropOn ? (buildDist.get(c) || 0) : 0;
  const isHit = dropOn && hits.has(c);
  const cut = k === 1 && DROP >= 0.3;
  const building = k > 0;
  const groove = L >= TIER_GROOVE;
  const full = L >= TIER_FULL;
  const beat = Tone.Time("4n").toSeconds();

  if (step === 0) {
    for (const n of NAMES) {
      place(buses[n], lon, time);
      buses[n].levelGain.gain.rampTo(busLevel(presence[n][c]), 0.35, time);   // volumen por cantidad
    }
    padFilter.frequency.rampTo(300 + 3700 * L, 0.5, time);
    droneGain.gain.rampTo(0.4 + 1.2 * L, 0.6, time);
    if (k === 3) startRiser(time, beat);
    if (isHit) hitMoment(time, beat);
    if (c % 4 === 0 && !cut) playPad(c, L, time);
  }

  if (k === 3 && (step === 0 || step === 2)) snare.triggerAttackRelease("16n", time, 0.35 * DROP);
  if (k === 2) snare.triggerAttackRelease("16n", time, (0.35 + 0.1 * step) * DROP);
  if (k === 1 && step >= 2) snare.triggerAttackRelease("16n", time, (0.6 + 0.15 * (step - 2)) * DROP);

  if (!cut) {
    if (!building && RHYTHM >= 0.03) {
      if (step === 0 && (full || (groove && c % 2 === 0))) kickHit(time, full ? 1 : 0.6);
      if (full && step === 2) hat.triggerAttackRelease("32n", time, 0.4 * RHYTHM);
      if (full && (step === 1 || step === 3) && Math.random() < 0.4)
        hat.triggerAttackRelease("32n", time, 0.2 * RHYTHM);
    }

    // HUMO -> bajo (más fuerte donde la celda tiene más humo)
    const sm = tops.smoke[c][0];
    if (sm && groove && !(isHit && step === 0) && (step === 0 || (full && step === 3))) {
      const n = pick(sm.row / grid.rows, -1, 1);
      lastLabel = n.label;
      bass.triggerAttackRelease(n.f, "8n", time, 0.95 * dyn(norm(sm.val)));
    }

    // POLVO -> arpegio (más fuerte donde la celda tiene más polvo)
    const notes = tops.dust[c];
    const active = full ? true : groove ? step % 2 === 0 : step === 0;
    if (notes.length && active && Math.random() < 0.3 + 0.7 * L) {
      const n = notes[(step + c) % notes.length];
      const f = pick(n.row / grid.rows, 1, 2);
      lastLabel = f.label;
      arp.triggerAttackRelease(f.f, "16n", time, Math.min(0.95, 0.95 * dyn(norm(n.val)) * (0.6 + 0.4 * L)));
    }

    // SULFATOS -> campanas (más fuertes donde la celda tiene más sulfato)
    const bl = tops.sulfate[c];
    if (bl.length && step === 2 && Math.random() < 0.35 + 0.5 * bl[0].val) {
      const f = pick(bl[0].row / grid.rows, 2, 2);
      lastLabel = f.label;
      bells.triggerAttackRelease(f.f, "4n", time, 0.9 * dyn(norm(bl[0].val)));
    }
  }

  if (step === 0) {
    const phase = isHit ? "¡Entrada!" : cut ? "Corte" : building ? "Build-up"
                : full ? "Pleno" : groove ? "Ritmo" : "Calma";
    Tone.Draw.schedule(() => draw(c, L, isHit, phase), time);
  }
}

// ---- Dibujo ----
const cv = document.getElementById("map");
const ctx = cv.getContext("2d");
const info = document.getElementById("info");

const PHASE_TXT = {
  "Calma": "Calma: poco aerosol. Suenan el drone y las especies presentes.",
  "Ritmo": "Ritmo suave: la densidad de aerosol sube y entra el bombo.",
  "Pleno": "Pleno: mucho aerosol y varias especies mezcladas.",
  "Build-up": "Build-up: el aire se espesa hacia un pico de densidad; el ritmo se retira.",
  "Corte": "Corte: silencio justo antes del pico.",
  "¡Entrada!": "¡Entrada! Pico de densidad del mapa; resuelve con 16:15 → 1:1.",
};

function draw(c, L = 0, hit = false, phase = "Calma") {
  ctx.clearRect(0, 0, cv.width, cv.height);
  if (img && img.complete) ctx.drawImage(img, 0, 0, cv.width, cv.height);
  const x = ((c + 0.5) / grid.cols) * cv.width;
  ctx.fillStyle = hit ? "rgba(255,210,90,.95)" : "rgba(255,255,255,.85)";
  ctx.fillRect(x - 2, 0, hit ? 8 : 4, cv.height);
  if (info) {
    const pr = presence.seasalt
      ? NAMES.map(n => `${SHORT[n]} ${Math.round(presence[n][c] * 100)}%`).join(" · ")
      : "";
    info.textContent =
      `${PHASE_TXT[phase]} · energía ${Math.round(L * 100)}% · presencia: ${pr} · último intervalo ${lastLabel}`;
  }
}

// ---- Interruptor Estéreo / Espacial ----
const modeBtn = document.getElementById("mode");
function applyMode() {
  for (const b of Object.values(buses)) {
    b.outStereo.gain.rampTo(spatialMode ? 0 : 1, 0.3);
    b.outSpatial.gain.rampTo(spatialMode ? SPATIAL_BOOST : 0, 0.3);
  }
  if (modeBtn) {
    modeBtn.textContent = spatialMode ? "Audio: Espacial 3D" : "Audio: Estéreo";
    modeBtn.setAttribute("aria-pressed", String(spatialMode));
  }
}
if (modeBtn) modeBtn.onclick = () => { spatialMode = !spatialMode; applyMode(); };

// ---- Solo por especie ----
let soloSpecies = null;
const DESC = {
  all: "Todo: centro = ritmo y drone · izquierda = sal marina · derecha = polvo · arriba = sulfatos · abajo = humo.",
  seasalt: "Sal marina (azul): pad espacial de acordes largos, a tu izquierda. Más fuerte donde hay más sal marina.",
  dust: "Polvo (violeta): arpegio con eco, a tu derecha. Más fuerte donde hay más polvo, como en la pluma del Sahara.",
  smoke: "Humo (naranja): bajo grave, abajo y al centro. Solo suena donde hay humo, y más fuerte donde hay más.",
  sulfate: "Sulfatos (verde): campanas brillantes, arriba. Más fuertes donde hay más contaminación o penachos volcánicos.",
};
const legend = document.getElementById("legend");
const soloBtns = document.querySelectorAll("#solo button");

function applySolo() {
  for (const n of NAMES)
    buses[n].soloGain.gain.rampTo(!soloSpecies || soloSpecies === n ? 1 : 0, 0.25);
  for (const n of ["drums", "drone"])
    buses[n].soloGain.gain.rampTo(soloSpecies ? SOLO_BACKING : 1, 0.25);
  soloBtns.forEach(b => {
    const on = (b.dataset.sp === "all" && !soloSpecies) || b.dataset.sp === soloSpecies;
    b.setAttribute("aria-pressed", String(on));
  });
  if (legend) legend.textContent = DESC[soloSpecies || "all"];
}
soloBtns.forEach(b => b.onclick = () => {
  soloSpecies = b.dataset.sp === "all" ? null : b.dataset.sp;
  applySolo();
});

// ---- Controles de mezcla ----
const rhythmEl = document.getElementById("rhythm");
const dropEl = document.getElementById("drop");
const dynEl = document.getElementById("dyn");
if (rhythmEl) { RHYTHM = rhythmEl.value / 100; rhythmEl.oninput = () => { RHYTHM = rhythmEl.value / 100; }; }
if (dropEl)   { DROP = dropEl.value / 100;     dropEl.oninput   = () => { DROP = dropEl.value / 100; }; }
if (dynEl)    { DYN = dynEl.value / 100;       dynEl.oninput    = () => { DYN = dynEl.value / 100; }; }

// ---- Arranque ----
let started = false, playing = false;
const btn = document.getElementById("play");
const status = document.getElementById("status");
btn.disabled = true;
status.textContent = "Cargando mapa?";

btn.onclick = async () => {
  if (!started) {
    await Tone.start();
    await reverb.generate();
    startDrone();
    riser.start();
    Tone.Transport.scheduleRepeat(tick, "16n");
    started = true;
  }
  playing = !playing;
  if (playing) { Tone.Transport.start(); Tone.getDestination().mute = false; }
  else         { Tone.Transport.pause(); Tone.getDestination().mute = true; }
  btn.textContent = playing ? "Pausar" : "Escuchar";
  status.textContent = playing ? "Sonando: barrido de oeste a este" : "En pausa";
};

(async () => {
  try {
    grid = await (await fetch("data/grid.json")).json();
    precompute();
    computePresence();
    computeEnergy();
    findHits();
    buildLevels();
    applyMode();
    applySolo();
    img = new Image();
    img.onload = () => draw(0, level[0]);
    img.src = "img/aerosols.jpg";
    draw(0, level[0]);
    btn.disabled = false;
    status.textContent = "Mapa listo. Usa aud?fonos y pulsa Escuchar.";
  } catch (e) {
    console.error(e);
    status.textContent = "No se pudo cargar el mapa (revisa data/grid.json e img/aerosols.jpg).";
  }
})();

// ---- Grabaci?n ----
const recorder = new Tone.Recorder();
Tone.getDestination().connect(recorder);
let recording = false;
const recBtn = document.getElementById("rec");

recBtn.onclick = async () => {
  if (!started) { status.textContent = "Pulsa Escuchar primero"; return; }
  if (!recording) {
    recorder.start();
    recording = true;
    recBtn.textContent = "Detener y guardar";
  } else {
    const blob = await recorder.stop();
    recording = false;
    recBtn.textContent = "Grabar";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "musica-universalis-v8.webm";
    a.click();
  }
};
