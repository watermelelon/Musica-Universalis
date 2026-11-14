// v2: raíz = año terrestre; tensión por densidad local; drone con intervalo de Kepler (16:15)

// ---- Raíz: el año terrestre llevado 32 octavas arriba (~136.10 Hz) ----
const EARTH_YEAR_S = 365.256 * 86400;
const ROOT = (1 / EARTH_YEAR_S) * 2 ** 32;
const KEPLER_EARTH = 16 / 15;                       // intervalo de Kepler para la Tierra
const KEPLER_CENTS = 1200 * Math.log2(KEPLER_EARTH); // ≈ 111.7 cents

Tone.Transport.bpm.value = 70;
const STEP = "8n";                                  // una columna por corchea

// ---- Escalas por especie: [numerador, denominador] relativas a la raíz ----
// calm = consonante (aire limpio), tense = tensa (aire cargado)
const SCALES = {
  seasalt: { calm: [[1,1],[5,4],[3,2]],         tense: [[9,8]] },
  dust:    { calm: [[4,3],[3,2],[5,3]],         tense: [[9,8],[16,15]] },
  smoke:   { calm: [[1,1],[3,2]],               tense: [[16,15],[9,8],[45,32]] },
  sulfate: { calm: [[5,4],[3,2],[2,1]],         tense: [[25,24],[16,15],[45,32]] },
};

// ---- Efectos ----
const reverb = new Tone.Reverb({ decay: 9, wet: 0.45 });
const panner = new Tone.Panner(0);
panner.connect(reverb);
reverb.toDestination();
const smokeFilter = new Tone.Filter(600, "lowpass").connect(panner);

function poly(Synth, opts, vol, out = panner) {
  const p = new Tone.PolySynth(Synth, opts);
  p.volume.value = vol;
  p.connect(out);
  return p;
}

// ---- Cuatro voces, una por tipo de aerosol ----
const voices = {
  seasalt: { oct: 1,  span: 2, synth: poly(Tone.Synth,
    { oscillator: { type: "sine" },     envelope: { attack: 1.2, decay: .5, sustain: .6, release: 3 } }, -14) },
  dust:    { oct: 1,  span: 2, synth: poly(Tone.Synth,
    { oscillator: { type: "triangle" }, envelope: { attack: .6, decay: .4, sustain: .5, release: 2.5 } }, -15) },
  smoke:   { oct: -1, span: 2, synth: poly(Tone.Synth,
    { oscillator: { type: "sawtooth" }, envelope: { attack: .8, decay: .5, sustain: .5, release: 3 } }, -18, smokeFilter) },
  sulfate: { oct: 2,  span: 2, synth: poly(Tone.FMSynth,
    { harmonicity: 3.01, modulationIndex: 6, envelope: { attack: .01, decay: 1.2, sustain: 0, release: 2 } }, -20) },
};

// fila (0 = arriba) -> razón de la lista dada (más arriba = más agudo)
function pick(list, rowFrac, octBase, span) {
  const n = list.length * span;
  const idx = Math.min(n - 1, Math.floor((1 - rowFrac) * n));
  const [num, den] = list[idx % list.length];
  const octave = Math.floor(idx / list.length) + octBase;
  return { f: ROOT * (num / den) * 2 ** octave, label: `${num}:${den}` };
}

// ---- Drone: raíz, quinta (3:2) y octava; se inclina hacia 16:15 con la tensión ----
const droneOscs = [];
function startDrone() {
  const f = new Tone.Filter(400, "lowpass").connect(reverb);
  [ROOT / 2, ROOT * 3 / 4, ROOT].forEach(fr => {
    const o = new Tone.Oscillator(fr, "sine");
    o.volume.value = -24;
    o.connect(f);
    o.start();
    droneOscs.push(o);
  });
  new Tone.LFO(1 / 60, 250, 700).connect(f.frequency).start();
}

// ---- Tensión por columna (densidad total + cuántas especies se mezclan) ----
let grid, img, col = 0, tension = [];
let lastLabel = "–";

function computeTension() {
  const names = Object.keys(voices);
  const dens = [], mix = [];
  for (let c = 0; c < grid.cols; c++) {
    let sum = 0, n = 0;
    for (const name of names) {
      let colSum = 0, mx = 0;
      for (let r = 0; r < grid.rows; r++) {
        const v = grid.layers[name][r][c];
        colSum += v;
        if (v > mx) mx = v;
      }
      sum += colSum;
      if (mx > 0.15) n++;
    }
    dens.push(sum);
    mix.push(n);
  }
  const sorted = [...dens].sort((a, b) => a - b);
  const p95 = sorted[Math.floor(0.95 * (sorted.length - 1))] || 1;
  const raw = dens.map((d, c) =>
    Math.min(1, 0.6 * Math.min(1, d / p95) + 0.4 * Math.max(0, mix[c] - 1) / 3));
  // suavizado de 5 columnas para que la tensión suba y baje con naturalidad
  tension = raw.map((_, c) => {
    let s = 0, k = 0;
    for (let j = -2; j <= 2; j++) {
      const i = c + j;
      if (i >= 0 && i < raw.length) { s += raw[i]; k++; }
    }
    return s / k;
  });
}

// ---- Barrido: cada paso lee una columna del mapa ----
function stepColumn(time) {
  const c = col;
  col = (col + 1) % grid.cols;
  const T = tension[c];

  panner.pan.setValueAtTime((c / (grid.cols - 1)) * 1.8 - 0.9, time);
  droneOscs.forEach(o => o.detune.rampTo(T * KEPLER_CENTS, 1.0, time));

  for (const [name, v] of Object.entries(voices)) {
    const layer = grid.layers[name];
    let best = 0, row = -1;
    for (let r = 0; r < grid.rows; r++) {
      if (layer[r][c] > best) { best = layer[r][c]; row = r; }
    }
    if (best > 0.15 && Math.random() < best) {
      const useTense = Math.random() < T * 0.8;
      const list = useTense ? SCALES[name].tense : SCALES[name].calm;
      const n = pick(list, row / grid.rows, v.oct, v.span);
      lastLabel = n.label;
      v.synth.triggerAttackRelease(n.f, "2n", time, 0.3 + 0.5 * best);
    }
  }
  Tone.Draw.schedule(() => draw(c, T), time);
}

// ---- Dibujo ----
const cv = document.getElementById("map");
const ctx = cv.getContext("2d");
const info = document.getElementById("info");   // opcional (ver HTML)

function draw(c, T = 0) {
  ctx.clearRect(0, 0, cv.width, cv.height);
  if (img && img.complete) ctx.drawImage(img, 0, 0, cv.width, cv.height);
  const x = ((c + 0.5) / grid.cols) * cv.width;
  ctx.fillStyle = "rgba(255,255,255,.85)";
  ctx.fillRect(x - 2, 0, 4, cv.height);
  if (info) info.textContent = `Tensión: ${Math.round(T * 100)}% · último intervalo: ${lastLabel}`;
}

// ---- Arranque ----
let started = false, playing = false;
const btn = document.getElementById("play");
const status = document.getElementById("status");

btn.onclick = async () => {
  if (!started) {
    await Tone.start();
    await reverb.generate();
    startDrone();
    Tone.Transport.scheduleRepeat(stepColumn, STEP);
    started = true;
  }
  playing = !playing;
  if (playing) { Tone.Transport.start(); Tone.getDestination().mute = false; }
  else         { Tone.Transport.pause(); Tone.getDestination().mute = true; }
  btn.textContent = playing ? "Pausar" : "Escuchar";
  status.textContent = playing ? "Sonando: barrido de oeste a este" : "En pausa";
};

(async () => {
  grid = await (await fetch("data/grid.json")).json();
  computeTension();
  img = new Image();
  img.onload = () => draw(0, tension[0]);
  img.src = "img/aerosols.jpg";
  draw(0, tension[0]);
})();

// ---- Grabación ----
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
    a.download = "musica-universalis-v2.webm";
    a.click();
  }
};