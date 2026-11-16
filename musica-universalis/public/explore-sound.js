// explore-sound.js: sound for the Explore page.
// The listening core follows your MUExplore script: every pixel in a small window is averaged (no 0.15 cut-off, zero = silence),
// each particle's volume follows its intensity, and its steady pattern is pitched by the map position (latitude).
// Unlockable themes sit on top. Needs Tone.js, explore.js (window.XMAP) and data/fine/*.png (from tools/build_grid.py).
(() => {
  const $ = id => document.getElementById(id);
  const NAMES = ["seasalt", "dust", "smoke", "sulfate"];
  const LABEL = { seasalt: "Sea salt", dust: "Dust", smoke: "Smoke", sulfate: "Sulfates" };
  const THEME = { seasalt: "Tide", dust: "Caravan", smoke: "Embers", sulfate: "Glass" };
  const COL = { seasalt: "#5aa9ff", dust: "#b98cff", smoke: "#ff9a4a", sulfate: "#5fd68a" };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---- Tuning ----
  const BPM = 108;          // same as the concert
  const HOLD_MS = 700;      // a theme lingers this long after you leave its area
  const MIN_GAP = 33;       // ms between listening updates (~30 per second). Higher = lighter on the CPU, lower = snappier
  const REVERB_DECAY = 6;   // seconds. The reverb is the heaviest effect: 8 sounded a little bigger but costs more CPU
  const SB = 1.3;           // loudness of the 3D path (it loses a little level with distance)
  // How much the browser may be busy before the music breaks. "interactive" = snappiest but fragile,
  // "balanced" = rides out short stalls (about a quarter of a second), "playback" = most stable but slower to react
  const LATENCY_HINT = "balanced";
  // Unlock: the particle must be thick in the listening window (strength) AND dominate the mix (share). Tune per particle.
  const UNLOCK = { seasalt: { strength: .55, share: .60 }, dust: { strength: .55, share: .60 },
                   smoke: { strength: .55, share: .60 }, sulfate: { strength: .55, share: .60 } };

  // Root = Earth's year raised 32 octaves (~136 Hz); pure-ratio pentatonic scale (as in the concert)
  const ROOT = (1 / (365.256 * 86400)) * 2 ** 32;
  const RATIOS = [[1, 1], [9, 8], [5, 4], [3, 2], [5, 3]];
  function pick(rowFrac, octBase, span) {
    const n = RATIOS.length * span, idx = Math.min(n - 1, Math.floor((1 - rowFrac) * n));
    const [a, b] = RATIOS[idx % RATIOS.length];
    return ROOT * (a / b) * 2 ** (Math.floor(idx / RATIOS.length) + octBase);
  }

  // ---- Fine data: one grayscale PNG per particle ----
  let D = null;                                         // { seasalt: {sat, w, h}, ... }
  // Summed-area table: the mean of ANY window costs 4 reads, so a big radius or a zoomed-out view is no heavier than a tiny one
  function makeLayer(data, w, h) {
    const W1 = w + 1, sat = new Uint32Array(W1 * (h + 1));
    for (let y = 0; y < h; y++) { let run = 0; for (let x = 0; x < w; x++) { run += data[y * w + x]; sat[(y + 1) * W1 + x + 1] = sat[y * W1 + x + 1] + run; } }
    return { sat, w, h };
  }
  async function loadData() {
    const entries = await Promise.all(NAMES.map(async name => {
      const file = `data/fine/${name}.png`, image = new Image();
      await new Promise((ok, no) => {
        const t = setTimeout(() => no(new Error("timed out: " + file)), 15000);
        image.onload = () => { clearTimeout(t); ok(); };
        image.onerror = () => { clearTimeout(t); no(new Error("could not open " + file)); };
        image.src = file;
      });
      const w = image.naturalWidth, h = image.naturalHeight, off = document.createElement("canvas");
      off.width = w; off.height = h;
      const c = off.getContext("2d", { willReadFrequently: true }); c.drawImage(image, 0, 0);
      const rgba = c.getImageData(0, 0, w, h).data, data = new Uint8Array(w * h);
      for (let p = 0, i = 0; p < data.length; p++, i += 4) {
        if (rgba[i + 3] && (rgba[i] !== rgba[i + 1] || rgba[i] !== rgba[i + 2])) throw new Error(file + " must be a grayscale intensity mask");
        data[p] = Math.round(rgba[i] * rgba[i + 3] / 255);
      }
      off.width = off.height = 1;
      return [name, makeLayer(data, w, h)];
    }));
    D = Object.fromEntries(entries);
  }
  // Mean intensity (0-1) of every pixel inside the window around (x, y); rx, ry are fractions of the map width and height
  function sample(x, y, rx, ry, out = {}) {
    for (const n of NAMES) {
      const L = D[n], x0 = clamp(Math.floor((x - rx) * L.w), 0, L.w - 1), x1 = clamp(Math.floor((x + rx) * L.w), 0, L.w - 1);
      const y0 = clamp(Math.floor((y - ry) * L.h), 0, L.h - 1), y1 = clamp(Math.floor((y + ry) * L.h), 0, L.h - 1);
      const W1 = L.w + 1, S = L.sat, sum = S[(y1 + 1) * W1 + x1 + 1] - S[y0 * W1 + x1 + 1] - S[(y1 + 1) * W1 + x0] + S[y0 * W1 + x0];
      out[n] = sum / 255 / ((x1 - x0 + 1) * (y1 - y0 + 1));
    }
    return out;
  }
  function isStrong(v, s) {
    const total = NAMES.reduce((a, n) => a + v[n], 0);
    return v[s] >= UNLOCK[s].strength && total > .02 && v[s] / total >= UNLOCK[s].share;
  }

  // ---- Engine (built on the first click on "Sound": browsers need a user gesture) ----
  let E = null, master, spatial = false, on = false, pulse = 0, probe = null, raf = 0, settleT = 0, toastT = 0, stepSec = 0;
  let values = Object.fromEntries(NAMES.map(n => [n, 0]));
  let mouse = { x: 0, y: 0 }, mouseInside = false;
  const unlocked = new Set(), themeOn = {}, tail = {}, lastStrong = {};
  const stage = $("stage"), cv = $("xmap");

  function makeBus(send, c, fixed) {
    const input = new Tone.Gain(1), level = new Tone.Gain(fixed ? 1 : 0), st = new Tone.Panner(c.pan);
    const oSt = new Tone.Gain(fixed || !spatial ? 1 : 0), sg = new Tone.Gain(send);
    input.connect(level); level.connect(st); st.connect(oSt); oSt.connect(master); oSt.connect(sg); sg.connect(E.reverb);
    let sp = null, oSp = null;
    if (!fixed) {                  // only the path in use is connected, so the 3D (HRTF) panners cost nothing while stereo is on
      sp = new Tone.Panner3D({ panningModel: "HRTF", distanceModel: "inverse", refDistance: 1, rolloffFactor: .12, positionX: c.x, positionY: c.y, positionZ: c.z });
      oSp = new Tone.Gain(spatial ? SB : 0); sp.connect(oSp); oSp.connect(master); oSp.connect(sg);
      if (spatial) { level.disconnect(st); level.connect(sp); }
    }
    return { input, level, st, sp, oSt, oSp, fixed };
  }
  function applySpatial() {        // crossfade to the other path, then disconnect the one no longer used
    const want = spatial;
    for (const b of Object.values(E.bus)) {
      if (b.fixed) continue;
      const to = want ? b.sp : b.st, from = want ? b.st : b.sp;
      b.level.connect(to); b.oSt.gain.rampTo(want ? 0 : 1, .3); b.oSp.gain.rampTo(want ? SB : 0, .3);
      setTimeout(() => { if (spatial === want) { try { b.level.disconnect(from); } catch (e) { /* already disconnected */ } } }, 450);
    }
  }
  const noise = (decay, attack = .001) => new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack, decay, sustain: 0, release: .1 } });

  function warm(poly, n) {
    poly.triggerAttackRelease(Array.from({ length: n }, (_, i) => 110 + i * 7), .02, Tone.now() + .05, 0);   // velocity 0 = silent
  }
  async function build() {
    E = {};
    Tone.Transport.bpm.value = BPM; stepSec = Tone.Time("8n").toSeconds();
    master = new Tone.Compressor(-20, 3).connect(new Tone.Limiter(-1).toDestination());
    E.reverb = new Tone.Reverb({ decay: REVERB_DECAY, wet: 1 }).connect(master); await E.reverb.generate();
    // Fixed places around the listener: left, right, above, low-centre (same as the concert)
    const B = E.bus = {
      seasalt: makeBus(.55, { x: -4.5, y: .5, z: -4, pan: -.65 }), dust: makeBus(.35, { x: 4.5, y: .5, z: -3.5, pan: .65 }),
      smoke: makeBus(.15, { x: 0, y: -2.5, z: -1.5, pan: 0 }), sulfate: makeBus(.60, { x: -1.5, y: 3, z: -3, pan: -.2 }),
      centre: makeBus(.40, { x: 0, y: -1.5, z: -3, pan: 0 }, true),
    };
    // Base voices: the concert's instruments
    E.seaFilter = new Tone.Filter(600, "lowpass");
    E.pad = new Tone.PolySynth(Tone.Synth, { oscillator: { type: "fatsawtooth", count: 3, spread: 28 }, envelope: { attack: 1.5, decay: .5, sustain: .8, release: 4 } });
    E.pad.volume.value = -16; E.pad.maxPolyphony = 18; E.pad.chain(E.seaFilter, new Tone.Chorus(3, 3.5, .6).start(), B.seasalt.input);
    const dly = new Tone.PingPongDelay("8n.", .35); dly.wet.value = .35;
    E.arp = new Tone.PolySynth(Tone.Synth, { oscillator: { type: "pwm", modulationFrequency: .4 }, envelope: { attack: .005, decay: .18, sustain: 0, release: .3 } });
    E.arp.volume.value = -14; E.arp.maxPolyphony = 8; E.arp.chain(new Tone.Filter(3200, "lowpass"), dly, B.dust.input);
    E.bass = new Tone.MonoSynth({ oscillator: { type: "sawtooth" }, envelope: { attack: .01, decay: .25, sustain: .4, release: .3 }, filter: { Q: 3, type: "lowpass", rolloff: -24 }, filterEnvelope: { attack: .01, decay: .2, sustain: .2, release: .4, baseFrequency: 120, octaves: 3 } });
    E.bass.volume.value = -10; E.bass.connect(B.smoke.input);
    E.bells = new Tone.PolySynth(Tone.FMSynth, { harmonicity: 3.01, modulationIndex: 6, envelope: { attack: .01, decay: 1.4, sustain: 0, release: 2.5 } });
    E.bells.volume.value = -18; E.bells.maxPolyphony = 8; E.bells.connect(B.sulfate.input);
    E.chime = new Tone.PolySynth(Tone.FMSynth, { harmonicity: 2, modulationIndex: 3, envelope: { attack: .01, decay: 1, sustain: 0, release: 1.5 } });
    E.chime.volume.value = -14; E.chime.maxPolyphony = 6; E.chime.connect(B.centre.input);
    // Soft drone: root, fifth and octave
    E.droneGain = new Tone.Gain(0).connect(B.centre.input);
    const df = new Tone.Filter(400, "lowpass").connect(E.droneGain);
    [ROOT / 2, ROOT * .75, ROOT].forEach(f => { const o = new Tone.Oscillator(f, "sine"); o.volume.value = -24; o.connect(df); o.start(); });
    new Tone.LFO(1 / 60, 250, 700).connect(df.frequency).start();

    // Unlockable themes: each has its own melody, beat and instruments, and plays from its particle's place
    const tg = E.tg = {}; for (const s of NAMES) tg[s] = new Tone.Gain(0).connect(B[s].input);
    const T = E.T = {};
    // Tide (sea salt): soft descending phrase, heartbeat kick, slow wave wash
    const tideKick = new Tone.MembraneSynth({ pitchDecay: .05, octaves: 4, envelope: { attack: .001, decay: .5, sustain: 0, release: .1 } }); tideKick.volume.value = -12; tideKick.connect(tg.seasalt);
    const wave = noise(.9, .4); wave.volume.value = -26; wave.chain(new Tone.Filter(1800, "lowpass"), tg.seasalt);
    const tideLead = new Tone.FMSynth({ harmonicity: 1, modulationIndex: 1.2, envelope: { attack: .03, decay: .7, sustain: .1, release: 1.2 } }); tideLead.volume.value = -12; tideLead.connect(tg.seasalt);
    const tideP = [3 / 2, 0, 5 / 4, 0, 1, 0, 9 / 8, 0, 5 / 4, 0, 3 / 2, 0, 2, 0, 3 / 2, 0];
    T.seasalt = (st, t) => { if (tideP[st]) tideLead.triggerAttackRelease(ROOT * 2 * tideP[st], "4n", t, .7);
      if (st === 0 || st === 8) tideKick.triggerAttackRelease(ROOT / 2, "8n", t, .8); if (st === 4 || st === 12) wave.triggerAttackRelease("2n", t, .6); };
    // Caravan (dust): syncopated plucks over a 3+3+2 hand drum
    const pluck = new Tone.PluckSynth({ attackNoise: 1.2, dampening: 3200, resonance: .94 }); pluck.volume.value = -6; pluck.connect(tg.dust);
    const tom = new Tone.MembraneSynth({ pitchDecay: .02, octaves: 2, envelope: { attack: .001, decay: .25, sustain: 0, release: .1 } }); tom.volume.value = -10; tom.connect(tg.dust);
    const cvP = [1, 0, 9 / 8, 4 / 3, 0, 3 / 2, 0, 8 / 5, 3 / 2, 0, 4 / 3, 0, 9 / 8, 0, 1, 0], cvD = { 0: 1, 3: .7, 6: .8, 8: 1, 11: .7, 14: .8 };
    T.dust = (st, t) => { if (cvP[st]) pluck.triggerAttack(ROOT * 2 * cvP[st], t); if (cvD[st]) tom.triggerAttackRelease(ROOT * (st % 8 ? 1.5 : 1), "16n", t, cvD[st]); };
    // Embers (smoke): low ostinato, half-time kick and snare, random fire crackle
    const embKick = new Tone.MembraneSynth({ pitchDecay: .05, octaves: 5, envelope: { attack: .001, decay: .4, sustain: 0, release: .1 } }); embKick.volume.value = -8; embKick.connect(tg.smoke);
    const embSnare = noise(.16); embSnare.volume.value = -20; embSnare.chain(new Tone.Filter(1400, "highpass"), tg.smoke);
    const crackle = noise(.02); crackle.volume.value = -26; crackle.chain(new Tone.Filter(2500, "highpass"), tg.smoke);
    const embBass = new Tone.MonoSynth({ oscillator: { type: "sawtooth" }, envelope: { attack: .01, decay: .2, sustain: .5, release: .2 }, filter: { Q: 2, type: "lowpass", rolloff: -24 }, filterEnvelope: { attack: .01, decay: .2, sustain: .2, release: .3, baseFrequency: 100, octaves: 2.5 } }); embBass.volume.value = -10; embBass.connect(tg.smoke);
    const emP = [1, 0, 0, 1, 0, 3 / 2, 0, 0, 1, 0, 0, 4 / 3, 0, 3 / 2, 0, 0];
    T.smoke = (st, t, step) => { if (emP[st]) embBass.triggerAttackRelease(ROOT / 2 * emP[st], "8n", t, .8);
      if (st === 0) embKick.triggerAttackRelease(ROOT / 4, "8n", t, 1); if (st === 10) embKick.triggerAttackRelease(ROOT / 4, "8n", t, .8);
      if (st === 8) embSnare.triggerAttackRelease("16n", t, .6);
      if (Math.random() < .5) crackle.triggerAttackRelease("64n", t + Math.random() * step, .3 + Math.random() * .5); };
    // Glass (sulfates): fast crystalline arpeggio with echoes, hi-hats and a tick
    const glassLead = new Tone.PolySynth(Tone.FMSynth, { harmonicity: 3.01, modulationIndex: 5, envelope: { attack: .005, decay: .6, sustain: 0, release: 1 } }); glassLead.volume.value = -16; glassLead.maxPolyphony = 10; glassLead.connect(tg.sulfate);
    const gHat = noise(.04); gHat.volume.value = -26; gHat.chain(new Tone.Filter(8000, "highpass"), tg.sulfate);
    const gTick = new Tone.Synth({ oscillator: { type: "sine" }, envelope: { attack: .001, decay: .05, sustain: 0, release: .02 } }); gTick.volume.value = -16; gTick.connect(tg.sulfate);
    const glP = [1, 5 / 4, 3 / 2, 2, 5 / 2, 3, 5 / 2, 2, 3 / 2, 2, 5 / 2, 3, 4, 3, 5 / 2, 2];
    T.sulfate = (st, t, step) => { glassLead.triggerAttackRelease(ROOT * 4 * glP[st], "16n", t, .6); glassLead.triggerAttackRelease(ROOT * 4 * glP[st], "16n", t + step / 2, .25);
      if (st % 2) gHat.triggerAttackRelease("32n", t, .5); if (st === 0 || st === 8) gTick.triggerAttackRelease(3000, "32n", t, .8); };

    // Create every voice now (silently) so none are built in the middle of the music
    warm(E.pad, 15); warm(E.arp, 6); warm(E.bells, 6); warm(E.chime, 4); warm(glassLead, 8);

    // One clock, in sixteenth notes. It only runs patterns while something is under the listening point.
    E.clock = new Tone.Clock(clockTick, BPM / 60 * 4);
    applyVolume();
  }

  // ---- The steady patterns (from MUExplore) + unlocked themes ----
  function clockTick(time) {
    if (!probe || !on) return;
    const late = Tone.immediate() - time;
    if (late > .04) { pulse++; lateN++; if (late > lateMax) lateMax = late; return; }   // too late to play on time: skip this tick instead of smearing it
    const k = pulse++, step = k % 8, v = values, row = clamp(probe.y, 0, 1), now = performance.now();
    if (v.seasalt > 0 && step === 0) { const f = pick(row, 0, 1); E.pad.triggerAttackRelease([f, f * 1.5, f * 2], 1.1, time, .65); }
    if (v.dust > 0 && step % 2 === 0) E.arp.triggerAttackRelease(pick(row, 1, 2) * [1, 1.25, 1.5, 1.25][step / 2], "16n", time, .7);
    if (v.smoke > 0 && step % 4 === 0) E.bass.triggerAttackRelease(pick(row, -1, 1), "8n", time, .65);
    if (v.sulfate > 0 && step % 4 === 2) E.bells.triggerAttackRelease(pick(row, 2, 2), "4n", time, .5);
    for (const s of NAMES) if (themeOn[s] && !isStrong(v, s) && now - lastStrong[s] > HOLD_MS) deactivate(s);
    if (k % 2 === 0) { const ts = (k / 2) % 16; for (const s of NAMES) if (themeOn[s] || Tone.now() < (tail[s] || 0)) E.T[s](ts, time, stepSec); }
  }

  // ---- Where are we listening? ----
  // Mouse over the map (not dragging): under the cursor. Keyboard or touch: under the crosshair (centre of the view).
  function probeNow() {
    if (!on) return null;
    const dragging = cv.classList.contains("drag");
    if (mouseInside) { if (dragging) return null; const p = XMAP.toImage(mouse.x, mouse.y); return { x: p.x, y: p.y, cursor: true }; }
    if (document.activeElement === cv) { const v = XMAP.view(); return { x: v.x, y: v.y, cursor: false }; }
    return null;
  }
  let lastKey = -1, lateN = 0, lateMax = 0, perfT = 0, ctxReady = false;
  let lastRun = 0;                                      // listening updates run at most every MIN_GAP ms
  const schedule = () => { if (raf) return; raf = -1; setTimeout(() => { raf = requestAnimationFrame(update); }, Math.max(0, MIN_GAP - (performance.now() - lastRun))); };
  const lastTarget = new WeakMap();                     // skip ramps that would not change anything audible (no automation spam)
  function ramp(param, v, t, eps) {
    const prev = lastTarget.get(param);
    if (prev !== undefined && Math.abs(prev - v) < eps && (v !== 0 || prev === 0)) return;
    lastTarget.set(param, v); param.rampTo(v, t, Tone.immediate());   // now, not now + look-ahead: hovering stays instant
  }
  function update() {
    raf = 0; lastRun = performance.now();
    if (!E || !D) return;
    const p = probeNow();
    probe = p && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1 ? p : null;     // black bars around the map are silence
    if (!probe) { silence(); paintRing(null); return; }
    const radius = +$("set-radius").value, rx = XMAP.pxToFrac(radius), ry = rx * D.seasalt.w / D.seasalt.h;
    const key = ((Math.round(probe.x * D.seasalt.w) * 2048 + Math.round(probe.y * D.seasalt.h)) * 64 + radius) * 1e4 + Math.round(rx * 1e5);
    if (key === lastKey) { paintRing(probe); return; }      // same spot, same window: nothing to recompute
    lastKey = key;
    sample(probe.x, probe.y, rx, ry, values);
    const exponent = .95 - (+$("set-detail").value / 100) * .65, now = performance.now();   // "small details": lifts quiet values
    for (const s of NAMES) {
      const x = values[s];
      ramp(E.bus[s].level.gain, x > 0 ? Math.pow(Math.min(1, x), exponent) * .8 : 0, .09, .004);   // zero stays silent, no fixed minimum
      if (isStrong(values, s)) { lastStrong[s] = now; if (!themeOn[s]) activate(s); }
    }
    ramp(E.seaFilter.frequency, 300 + 2500 * Math.sqrt(values.seasalt), .2, 12);
    ramp(E.droneGain.gain, $("set-drone").checked ? .22 : 0, .3, .01);
    paintRing(probe); paintMeters();
    clearTimeout(settleT); settleT = setTimeout(say, 900);
  }
  function silence() {
    lastKey = -1;
    if (!E) return;
    for (const s of NAMES) { ramp(E.bus[s].level.gain, 0, .1, .004); if (themeOn[s]) deactivate(s); }
    ramp(E.droneGain.gain, 0, .3, .01);
  }

  // ---- Unlocks, meters, announcements ----
  function activate(s) {
    themeOn[s] = true; E.tg[s].gain.rampTo(1, 1.2);
    if (!unlocked.has(s)) {
      unlocked.add(s);
      const t = Tone.now() + .05; [1, 5 / 4, 3 / 2, 2].forEach((r, i) => E.chime.triggerAttackRelease(ROOT * 4 * r, "8n", t + i * .09, .6));
      toast(`Unlocked: ${THEME[s]} (${LABEL[s].toLowerCase()})`);
      $("live-sound").textContent = `Unlocked a new melody and beat: ${THEME[s]}, from ${LABEL[s].toLowerCase()}. ${unlocked.size} of 4 unlocked.`;
    }
  }
  function deactivate(s) { themeOn[s] = false; tail[s] = Tone.now() + 3; E.tg[s].gain.rampTo(0, 2.5); }
  function toast(msg) { const el = $("toast"); el.textContent = msg; el.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove("show"), 3800); }
  function say() {
    if (!probe) return;
    const total = NAMES.reduce((a, n) => a + values[n], 0);
    $("live-sound").textContent = total < .01 ? "Almost no particles here."
      : NAMES.map(s => `${LABEL[s]} ${Math.round(values[s] * 100)}`).join(", ") + " (visual intensity, out of 100).";
  }
  const chips = {};
  function buildMeters() {
    $("meters").innerHTML = NAMES.map(s => `<span class="chip" id="chip-${s}">${LABEL[s]} <i><b style="background:${COL[s]};width:0"></b></i><em></em></span>`).join("");
    for (const s of NAMES) { const c = $("chip-" + s); chips[s] = { c, b: c.querySelector("b"), e: c.querySelector("em") }; }
  }
  let meterSig = -1;
  function paintMeters() {                             // only touch the page when something visible changed
    let sig = 0;
    for (const s of NAMES) sig = sig * 131 + Math.round(Math.min(1, values[s]) * 50) * 3 + (themeOn[s] ? 2 : unlocked.has(s) ? 1 : 0);
    if (sig === meterSig) return; meterSig = sig;
    for (const s of NAMES) { chips[s].b.style.width = Math.round(Math.min(1, values[s]) * 100) + "%"; chips[s].c.classList.toggle("on", !!themeOn[s]); chips[s].e.textContent = themeOn[s] ? "★" : (unlocked.has(s) ? "✓" : ""); }
  }
  let sr = stage.getBoundingClientRect(), lastRad = -1;   // cached: measuring the page on every update forces a re-layout
  new ResizeObserver(() => { sr = stage.getBoundingClientRect(); }).observe(stage);
  function paintRing(p) {                              // a ring showing the listening window (moved with transform: no layout)
    const r = $("probe");
    if (!p) { if (r.style.display !== "none") r.style.display = "none"; return; }
    const rad = Math.max(4, +$("set-radius").value);
    if (rad !== lastRad) { lastRad = rad; r.style.width = r.style.height = 2 * rad + "px"; }
    r.style.display = "block";
    r.style.transform = `translate(${(p.cursor ? mouse.x - sr.left : sr.width / 2) - rad}px,${(p.cursor ? mouse.y - sr.top : sr.height / 2) - rad}px)`;
  }
  function applyVolume() { const v = +$("vol").value; Tone.getDestination().volume.value = v === 0 ? -Infinity : -48 * (1 - v / 100); }

  function showPerf() {                                // a small readout so you can see whether the music is keeping up
    const st = XMAP.stats ? XMAP.stats() : null;
    $("perf").textContent = `Audio: ${Math.round(Tone.getContext().lookAhead * 1000)} ms look-ahead, ${lateN} late notes skipped (worst ${Math.round(lateMax * 1000)} ms)` +
      (st ? ` · Map: ${st.ms.toFixed(0)} ms per frame at ${Math.round(st.scale * 100)}% resolution` : "");
  }

  // ---- Buttons and events ----
  const snd = $("snd");
  async function toggle() {
    if (!E) {
      snd.disabled = true; snd.textContent = "Loading sound…";
      try { if (!ctxReady) { Tone.setContext(new Tone.Context({ latencyHint: LATENCY_HINT })); ctxReady = true; }   // before any node exists
            await Tone.start(); await loadData(); await build(); buildMeters();
            $("sound-data").textContent = `Fine detail active: ${D.seasalt.w} × ${D.seasalt.h}. Visual intensity, not physical concentration.`; }
      catch (e) { console.error(e); E = null; D = null; snd.disabled = false; snd.textContent = "Sound: off";
        $("sound-data").textContent = "Could not start the sound: " + e.message + ". Check data/fine/*.png and open the page through a local server.";
        $("live-sound").textContent = "Could not start the sound."; return; }
      snd.disabled = false;
    }
    on = !on; snd.setAttribute("aria-pressed", String(on)); snd.textContent = "Sound: " + (on ? "on" : "off");
    Tone.getDestination().mute = !on;
    if (on) { pulse = 0; lastKey = -1; E.clock.start(); schedule(); perfT = setInterval(showPerf, 1000); }
    else { E.clock.stop(); silence(); paintRing(null); clearInterval(perfT); }
    $("live-sound").textContent = on ? "Sound on. Move the mouse over the map, or move the crosshair with the keyboard, to listen." : "Sound off.";
  }
  snd.onclick = toggle;
  $("vol").oninput = () => { if (E) applyVolume(); };
  $("spatial").onclick = e => {
    spatial = !spatial; e.currentTarget.setAttribute("aria-pressed", String(spatial)); e.currentTarget.textContent = "Spatial: " + (spatial ? "on" : "off");
    if (E) applySpatial();
  };
  $("set-radius").oninput = () => { $("set-radius-val").textContent = $("set-radius").value + " px"; lastKey = -1; schedule(); };
  $("set-detail").oninput = () => { lastKey = -1; schedule(); }; $("set-drone").onchange = () => { lastKey = -1; schedule(); };
  cv.addEventListener("pointermove", e => { if (e.pointerType === "mouse") { mouse = { x: e.clientX, y: e.clientY }; mouseInside = true; schedule(); } });
  cv.addEventListener("pointerleave", () => { mouseInside = false; schedule(); });
  cv.addEventListener("focus", schedule); cv.addEventListener("blur", schedule);
  document.addEventListener("visibilitychange", () => { if (document.hidden && on) toggle(); });
  XMAP.onView = schedule;
  window.EXPSOUND = { setData(d) { D = d; }, makeLayer, sample, isStrong };      // used for testing
})();