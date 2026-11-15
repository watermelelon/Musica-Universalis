// flow.js: screens, setup and guide. Load AFTER app.js (it shares app.js globals: Tone, buses, pad, arp, bass, bells, ROOT...)

const SCREENS = ["welcome", "setup", "guide", "listen", "explore"];
const live = document.getElementById("live");

// ---- Audio unlock (same first-time setup as the Play button in app.js, done once) ----
async function ensureAudio() {
  if (started) return;
  await Tone.start();
  await reverb.generate();
  startDrone();
  riser.start();
  Tone.Transport.scheduleRepeat(tick, "16n");
  started = true;
}

// ---- Volume: 0-100 -> 0 dB at 100, silence at 0 ----
const vol = document.getElementById("vol");
function setVol() {
  const v = Number(vol.value);
  Tone.getDestination().volume.value = v === 0 ? -Infinity : -48 * (1 - v / 100);
}
vol.oninput = setVol;
setVol();

// ---- Screens ----
function show(name) {
  if (!SCREENS.includes(name)) name = "welcome";
  SCREENS.forEach(s => { document.getElementById("s-" + s).hidden = s !== name; });
  document.getElementById("progress").hidden = name === "welcome";
  document.querySelectorAll("#steps li").forEach(li => {
    if (li.dataset.step === name) li.setAttribute("aria-current", "step");
    else li.removeAttribute("aria-current");
  });
  if (name !== "listen" && typeof playing !== "undefined" && playing) document.getElementById("play").click();
  const h = document.querySelector("#s-" + name + " h1, #s-" + name + " h2");
  document.title = h.textContent + " · Musica Universalis";
  h.focus();
  live.textContent = h.textContent;
  window.scrollTo(0, 0);
}
document.querySelectorAll("[data-go]").forEach(b => b.onclick = () => { location.hash = b.dataset.go; });
window.addEventListener("hashchange", () => show(location.hash.slice(1)));
show(location.hash.slice(1) || "welcome");

// ---- Setup: left / right / both ear test ----
function testTone(pan, label) {
  ensureAudio().then(() => {
    const p = new Tone.Panner(pan).toDestination();
    const s = new Tone.Synth({ oscillator: { type: "sine" }, envelope: { attack: 0.02, decay: 0.1, sustain: 0.6, release: 0.6 } }).connect(p);
    const t = Tone.now() + 0.05;
    (pan === 0 ? [ROOT * 2, ROOT * 3, ROOT * 4] : [ROOT * 3]).forEach((f, i) => s.triggerAttackRelease(f, "8n", t + i * 0.25));
    live.textContent = label;
    setTimeout(() => { s.dispose(); p.dispose(); }, 2500);
  });
}
document.getElementById("t-left").onclick = () => testTone(-1, "Playing in your left ear");
document.getElementById("t-right").onclick = () => testTone(1, "Playing in your right ear");
document.getElementById("t-both").onclick = () => testTone(0, "Playing in both ears");

// ---- Guide: one card per species ----
const GUIDE = [
  { id: "seasalt", color: "#5aa9ff", name: "Sea salt",
    desc: "Fine salt lifted from the ocean surface by wind and waves. It sounds like a soft, slow pad of long chords.",
    where: "Where you hear it: to your left. It plays where the map shows blue and white swirls." },
  { id: "dust", color: "#b98cff", name: "Dust",
    desc: "Mineral dust from deserts, like the huge plume that crosses the Atlantic from the Sahara. It sounds like a rhythmic arpeggio with echo.",
    where: "Where you hear it: to your right. It plays where the map shows violet." },
  { id: "smoke", color: "#ff9a4a", name: "Smoke",
    desc: "Smoke from wildfires and burning land. It sounds like deep, low bass pulses.",
    where: "Where you hear it: low and near the centre. It plays where the map shows orange and red." },
  { id: "sulfate", color: "#5fd68a", name: "Sulfates",
    desc: "Particles from pollution and volcanoes. They sound like bright bell tones.",
    where: "Where you hear it: above you. It plays where the map shows green." },
];
let gi = 0;
const gTitle = document.getElementById("g-title"), gDesc = document.getElementById("g-desc"),
      gWhere = document.getElementById("g-where"), gBack = document.getElementById("g-back"),
      gNext = document.getElementById("g-next");

function renderGuide() {
  const g = GUIDE[gi];
  gTitle.innerHTML = `<span class="sw" style="background:${g.color}" aria-hidden="true"></span>${g.name} (${gi + 1} of ${GUIDE.length})`;
  gDesc.textContent = g.desc;
  gWhere.textContent = g.where;
  gBack.disabled = gi === 0;
  gNext.textContent = gi === GUIDE.length - 1 ? "Finish guide and listen" : "Next";
}
async function demo(id) {
  await ensureAudio();
  for (const n of NAMES) buses[n].levelGain.gain.rampTo(1, 0.05);
  const t = Tone.now() + 0.05;
  if (id === "seasalt") pad.triggerAttackRelease([ROOT, ROOT * 1.5, ROOT * 2, ROOT * 2.5], "2m", t, 0.7);
  if (id === "dust") {
    const seq = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2, 5 / 3, 3 / 2];
    seq.forEach((r, i) => arp.triggerAttackRelease(ROOT * 2 * r, "16n", t + i * 0.16, 0.7));
  }
  if (id === "smoke") [1, 1.5, 1, 1.5].forEach((r, i) => bass.triggerAttackRelease(ROOT * 0.5 * r, "8n", t + i * 0.5, 0.9));
  if (id === "sulfate") [1, 5 / 4, 3 / 2, 2].forEach((r, i) => bells.triggerAttackRelease(ROOT * 4 * r, "4n", t + i * 0.45, 0.8));
  live.textContent = "Playing " + GUIDE.find(g => g.id === id).name;
}
document.getElementById("g-play").onclick = () => demo(GUIDE[gi].id);
gBack.onclick = () => { if (gi > 0) { gi--; renderGuide(); } };
gNext.onclick = () => {
  if (gi < GUIDE.length - 1) { gi++; renderGuide(); } else { location.hash = "listen"; }
};
renderGuide();

// ---- Explore: needs sound enabled (explore.js will mount into #explore-root later) ----
document.getElementById("ex-enable").onclick = async e => {
  await ensureAudio();
  e.target.textContent = "Sound enabled";
  e.target.disabled = true;
  live.textContent = "Sound enabled";
};