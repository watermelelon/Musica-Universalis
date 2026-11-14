import * as Tone from 'tone';

// ---- Afinación justa: raíz fija + razones puras (pentatónica) ----
const ROOT = 146.83;                       // D3
const RATIOS = [1, 9/8, 5/4, 3/2, 5/3];
Tone.Transport.bpm.value = 70;
const STEP = "8n";                         // una columna por corchea

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

// fila (0 = arriba) -> frecuencia de la escala justa
function freq(rowFrac, octBase, span) {
  const n = RATIOS.length * span;
  const idx = Math.min(n - 1, Math.floor((1 - rowFrac) * n));
  return ROOT * RATIOS[idx % RATIOS.length] * 2 ** (Math.floor(idx / RATIOS.length) + octBase);
}

// ---- Drone: raíz y quinta (3:2) con barrido lento de filtro ----
function startDrone() {
  const f = new Tone.Filter(400, "lowpass").connect(reverb);
  [ROOT / 2, ROOT * 3 / 4, ROOT].forEach(fr => {
    const o = new Tone.Oscillator(fr, "sine");
    o.volume.value = -24;
    o.connect(f);
    o.start();
  });
  new Tone.LFO(1 / 60, 250, 700).connect(f.frequency).start();
}

// ---- Barrido: cada paso lee una columna del mapa ----
let grid, img, col = 0;

function stepColumn(time) {
  const c = col;
  col = (col + 1) % grid.cols;
  panner.pan.setValueAtTime((c / (grid.cols - 1)) * 1.8 - 0.9, time);

  for (const [name, v] of Object.entries(voices)) {
    const layer = grid.layers[name];
    let best = 0, row = -1;
    for (let r = 0; r < grid.rows; r++) {
      if (layer[r][c] > best) { best = layer[r][c]; row = r; }
    }
    // umbral + probabilidad: los datos deciden, el azar da vida
    if (best > 0.15 && Math.random() < best) {
      v.synth.triggerAttackRelease(
        freq(row / grid.rows, v.oct, v.span), "2n", time, 0.3 + 0.5 * best);
    }
  }
  Tone.Draw.schedule(() => draw(c), time);
}

// ---- Dibujo ----
const cv = document.getElementById("map");
const ctx = cv.getContext("2d");
function draw(c) {
  ctx.clearRect(0, 0, cv.width, cv.height);
  if (img && img.complete) ctx.drawImage(img, 0, 0, cv.width, cv.height);
  const x = ((c + 0.5) / grid.cols) * cv.width;
  ctx.fillStyle = "rgba(255,255,255,.85)";
  ctx.fillRect(x - 2, 0, 4, cv.height);
}

// ---- Arranque ----
let started = false, playing = false;
const btn = document.getElementById("play");
const status = document.getElementById("status");
btn.disabled = true;
status.textContent = "Cargando mapa…";

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
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}data/grid.json`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    grid = await response.json();
    if (!Number.isInteger(grid.cols) || grid.cols < 2 || !Number.isInteger(grid.rows) || grid.rows < 1 || Object.keys(voices).some(name => !Array.isArray(grid.layers?.[name]) || grid.layers[name].length !== grid.rows || grid.layers[name].some(row => !Array.isArray(row) || row.length !== grid.cols || row.some(value => !Number.isFinite(value) || value < 0 || value > 1)))) throw new Error('Formato grid.json no válido');
    img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('No se pudo cargar aerosols.jpg'));
      img.src = `${import.meta.env.BASE_URL}img/aerosols.jpg`;
    });
    draw(0);
    btn.disabled = false;
    status.textContent = "Mapa listo. Pulsa Escuchar.";
  } catch (error) {
    console.error(error);
    status.textContent = "No se pudo cargar el mapa. Comprueba los datos y la imagen de aerosoles.";
  }
})();

// ---- Grabación ----
const recorder = new Tone.Recorder();
Tone.getDestination().connect(recorder);
let recording = false;
const recBtn = document.getElementById("rec");

recBtn.onclick = async () => {
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
    a.download = "musica-universalis-v1.webm";
    a.click();
  }
};
