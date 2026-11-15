// explore.js: League-of-Legends-style map roaming. The map fills the screen, a mini-map shows where you are.
// Starts on the whole map, then eases into a close-up. Needs PLACES (defined in explore.html).
(() => {
  const $ = id => document.getElementById(id);
  const cv = $("xmap"), ctx = cv.getContext("2d"), mini = $("mini"), mctx = mini.getContext("2d"), stage = $("stage");

  // ---- Tuning ----
  const MIN_Z = 1, MAX_Z = 5;          // 1 = whole map fits the screen. The 4K image softens past ~4x
  const DEFAULT_Z = 2.6;               // the close-up you roam in
  const START = [0.50, 0.40];          // where the close-up lands (image fractions): the Saharan plume
  const INTRO_DELAY = 900;             // ms showing the whole map before zooming in
  const KEY_PAN = 480;                 // keyboard pan, screen px per second
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const SM_PAN = reduce ? 0.03 : 0.16, SM_ZOOM = reduce ? 0.03 : 0.22;   // smoothing (s): higher = floatier
  let speed = 0.6;                     // mouse drag, hover and wheel speed (slider)
  const DEAD = 0.45;                   // hover steering: the middle 45% of the map does nothing (bigger = calmer)
  const STEER_PX = 520;                // hover steering: screen px per second at the very edge
  const STEER_RAMP = 0.35;             // seconds to reach full speed, so crossing an edge by accident barely moves

  const img = new Image();
  let iw = 0, ih = 0, cw = 0, ch = 0, dpr = 1, base = 1;
  let ready = false, started = false, raf = 0, last = 0, settle = 0, nearName = "", miniDrag = false, pinchD = 0;
  const tgt = { x: 0, y: 0, z: 1 }, cur = { x: 0, y: 0, z: 1 };    // camera centre in image pixels
  const keys = new Set(), pointers = new Map();
  let steerOn = true, canSteer = false, hover = null, steerGain = 0, steering = false;
  const ramp = v => { const a = Math.abs(v); return a <= DEAD ? 0 : Math.sign(v) * ((a - DEAD) / (1 - DEAD)) ** 2; };

  const clampZ = z => Math.min(MAX_Z, Math.max(MIN_Z, z));
  const scaleOf = s => base * s.z;                                  // css px per image px
  function clampCam(s) {
    const sc = scaleOf(s), vw = cw / sc, vh = ch / sc;
    s.x = vw >= iw ? iw / 2 : Math.min(iw - vw / 2, Math.max(vw / 2, s.x));
    s.y = vh >= ih ? ih / 2 : Math.min(ih - vh / 2, Math.max(vh / 2, s.y));
  }

  // ---- Drawing ----
  function draw() {
    if (!ready || !cw) return;
    const sc = scaleOf(cur) * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = "#000"; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.setTransform(sc, 0, 0, sc, cv.width / 2 - cur.x * sc, cv.height / 2 - cur.y * sc);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0);
    if (steerOn) {                                           // small centre mark: the middle is the "stop" zone
      const x = cv.width / 2, y = cv.height / 2, a = 9 * dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = dpr;
      ctx.beginPath(); ctx.moveTo(x - a, y); ctx.lineTo(x + a, y); ctx.moveTo(x, y - a); ctx.lineTo(x, y + a); ctx.stroke();
    }
    drawMini();
  }
  function drawMini() {
    const mw = mini.width, mh = mini.height, sc = scaleOf(cur), k = mw / iw;
    const vw = Math.min(iw, cw / sc), vh = Math.min(ih, ch / sc), x = (cur.x - vw / 2) * k, y = (cur.y - vh / 2) * k;
    mctx.clearRect(0, 0, mw, mh); mctx.drawImage(img, 0, 0, mw, mh);
    mctx.fillStyle = "rgba(0,0,0,.5)"; mctx.beginPath(); mctx.rect(0, 0, mw, mh); mctx.rect(x, y, vw * k, vh * k); mctx.fill("evenodd");
    mctx.lineWidth = 2 * dpr; mctx.strokeStyle = "#ffd25a"; mctx.strokeRect(x, y, vw * k, vh * k);
  }

  // ---- Animation loop (only runs while something moves) ----
  function kick() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  function frame(t) {
    raf = 0;
    const dt = Math.min(0.05, (t - last) / 1000 || 0.016);
    if (keys.size) {
      const v = KEY_PAN * (speed / 0.6) * dt / scaleOf(tgt);
      if (keys.has("ArrowLeft") || keys.has("a")) tgt.x -= v;
      if (keys.has("ArrowRight") || keys.has("d")) tgt.x += v;
      if (keys.has("ArrowUp") || keys.has("w")) tgt.y -= v;
      if (keys.has("ArrowDown") || keys.has("s")) tgt.y += v;
      clampCam(tgt);
    }
    steering = false;
    if (steerOn && canSteer && hover && !pointers.size) {
      const vx = ramp((hover.x - cw / 2) / (cw / 2)), vy = ramp((hover.y - ch / 2) / (ch / 2));
      if (vx || vy) {
        steerGain = Math.min(1, steerGain + dt / STEER_RAMP);
        const v = STEER_PX * (speed / 0.6) * steerGain * dt / scaleOf(tgt);
        tgt.x += vx * v; tgt.y += vy * v; clampCam(tgt); steering = true;
      } else steerGain = 0;
    } else steerGain = 0;
    const kp = 1 - Math.exp(-dt / SM_PAN), kz = 1 - Math.exp(-dt / SM_ZOOM);
    cur.x += (tgt.x - cur.x) * kp; cur.y += (tgt.y - cur.y) * kp;
    cur.z = Math.exp(Math.log(cur.z) + (Math.log(tgt.z) - Math.log(cur.z)) * kz);
    clampCam(cur); draw(); updateNear();
    if (api.onView) api.onView(cur);
    clearTimeout(settle); settle = setTimeout(announce, 700);
    const sc = scaleOf(cur);
    if (keys.size || steering || Math.abs(tgt.x - cur.x) * sc > 0.2 || Math.abs(tgt.y - cur.y) * sc > 0.2 || Math.abs(Math.log(tgt.z / cur.z)) > 1e-3) kick();
  }

  // ---- Camera moves ----
  function zoomAt(px, py, f) {                      // px, py: point on the map, in css px from the top-left
    const z2 = clampZ(tgt.z * f), s1 = scaleOf(tgt), s2 = base * z2;
    const ax = tgt.x + (px - cw / 2) / s1, ay = tgt.y + (py - ch / 2) / s1;   // image point under that spot
    tgt.z = z2; tgt.x = ax - (px - cw / 2) / s2; tgt.y = ay - (py - ch / 2) / s2;
    clampCam(tgt); kick();
  }
  function flyTo(nx, ny, z) { tgt.z = clampZ(z); tgt.x = nx * iw; tgt.y = ny * ih; clampCam(tgt); kick(); }
  const zoomCentre = f => zoomAt(cw / 2, ch / 2, f);

  // ---- Where am I? ----
  function nearest() {
    if (typeof PLACES === "undefined") return null;
    const nx = cur.x / iw, ny = cur.y / ih; let b = null, bd = 1;
    for (const p of PLACES) { const d = Math.hypot(p.x - nx, p.y - ny); if (d < bd) { bd = d; b = p; } }
    return bd < 0.1 ? b : null;
  }
  function updateNear() { const n = nearest(), name = n ? n.n : ""; if (name !== nearName) { nearName = name; $("near").textContent = name; } }
  function announce() { $("live").textContent = `Zoom ${(cur.z).toFixed(1)}×.` + (nearName ? ` Near ${nearName}.` : ""); }

  // ---- Mouse and touch on the map ----
  const rect = () => cv.getBoundingClientRect();
  const dist = () => { const [a, b] = [...pointers.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  cv.addEventListener("pointerdown", e => {
    cv.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    cv.classList.add("drag");
    if (pointers.size === 2) pinchD = dist();
  });
  cv.addEventListener("pointermove", e => {
    const p = pointers.get(e.pointerId);
    if (!p) {
      if (e.pointerType === "mouse") { const r = rect(); hover = { x: e.clientX - r.left, y: e.clientY - r.top }; if (steerOn && canSteer) kick(); }
      if (api.onHover) { const q = api.toImage(e.clientX, e.clientY); api.onHover(q.x, q.y, cur.z); } return;
    }
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (pointers.size === 1) {
      const k = (p.type === "mouse" ? speed : 1) / scaleOf(tgt);      // touch follows the finger 1:1; the mouse is slowed
      tgt.x -= dx * k; tgt.y -= dy * k; clampCam(tgt); kick();
    } else if (pointers.size === 2) {
      const d = dist(), [a, b] = [...pointers.values()], r = rect();
      zoomAt((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, d / pinchD); pinchD = d;
    }
  });
  const up = e => { pointers.delete(e.pointerId); if (!pointers.size) cv.classList.remove("drag"); pinchD = 0; };
  cv.addEventListener("pointerleave", () => { hover = null; steerGain = 0; });
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  cv.addEventListener("wheel", e => {
    e.preventDefault();
    let d = e.deltaY * (e.deltaMode === 1 ? 16 : 1); d = Math.max(-120, Math.min(120, d));
    const r = rect(); zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-d * 0.0015 * (speed / 0.6)));
  }, { passive: false });

  // ---- Mini-map: click or drag to move the view ----
  function miniTo(e) {
    const r = mini.getBoundingClientRect();
    tgt.x = (e.clientX - r.left) / r.width * iw; tgt.y = (e.clientY - r.top) / r.height * ih; clampCam(tgt); kick();
  }
  mini.addEventListener("pointerdown", e => { mini.setPointerCapture(e.pointerId); miniDrag = true; miniTo(e); });
  mini.addEventListener("pointermove", e => { if (miniDrag) miniTo(e); });
  mini.addEventListener("pointerup", () => { miniDrag = false; }); mini.addEventListener("pointercancel", () => { miniDrag = false; });

  // ---- Keyboard ----
  cv.addEventListener("keydown", e => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k.startsWith("Arrow") || "wasd".includes(k) && k.length === 1) { e.preventDefault(); keys.add(k); kick(); }
    else if (k === "+" || k === "=") zoomCentre(1.25);
    else if (k === "-" || k === "_") zoomCentre(1 / 1.25);
    else if (k === "0") zoomCentre(DEFAULT_Z / tgt.z);
    else if (k === "Home") flyTo(.5, .5, 1);
  });
  cv.addEventListener("keyup", e => keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));
  cv.addEventListener("blur", () => keys.clear());

  // ---- Settings and places ----
  $("z-in").onclick = () => zoomCentre(1.4);
  $("z-out").onclick = () => zoomCentre(1 / 1.4);
  $("z-whole").onclick = () => flyTo(.5, .5, 1);
  $("z-close").onclick = () => zoomCentre(DEFAULT_Z / tgt.z);
  const steerBtn = $("steer");
  function setSteer(on, say = true) {
    steerOn = on; steerGain = 0; steerBtn.setAttribute("aria-pressed", String(on));
    steerBtn.textContent = "Hover to move: " + (on ? "on" : "off"); cv.classList.toggle("steer", on); draw();
    if (say) $("live").textContent = on ? "Hover to move is on. Move the mouse toward an edge to roam, keep it in the middle to stop."
                                        : "Hover to move is off. Drag the map to move.";
  }
  steerBtn.onclick = () => setSteer(!steerOn);
  document.addEventListener("keydown", e => { if (e.key === "Escape" && steerOn) setSteer(false); });
  setSteer(true, false);
  $("nav-speed").oninput = e => { speed = e.target.value / 100; };
  document.querySelectorAll("[data-place]").forEach(b => b.addEventListener("click", () => {
    const p = PLACES[+b.dataset.place]; flyTo(p.x, p.y, DEFAULT_Z); $("live").textContent = `Going to ${p.n}.`;
  }));

  // ---- Start: whole map first, then ease into the close-up ----
  function start() {
    if (started || !ready || !cw) return; started = true;
    cur.x = tgt.x = iw / 2; cur.y = tgt.y = ih / 2; cur.z = tgt.z = 1; clampCam(cur); clampCam(tgt); draw();
    const go = () => { flyTo(START[0], START[1], DEFAULT_Z); if (reduce) { Object.assign(cur, tgt); draw(); } };
    reduce ? (go(), canSteer = true) : (setTimeout(go, INTRO_DELAY), setTimeout(() => { canSteer = true; }, INTRO_DELAY + 1500));
  }

  // ---- Size and loading ----
  new ResizeObserver(() => {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = stage.getBoundingClientRect(); cw = r.width; ch = r.height;
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    const m = mini.getBoundingClientRect(); mini.width = Math.round(m.width * dpr); mini.height = Math.round(m.height * dpr);
    if (ready) { base = Math.min(cw / iw, ch / ih); clampCam(tgt); clampCam(cur); draw(); start(); }
  }).observe(stage);
  new ResizeObserver(() => { const m = mini.getBoundingClientRect(); mini.width = Math.round(m.width * dpr); mini.height = Math.round(m.height * dpr); if (ready) drawMini(); }).observe(mini);
  img.onload = () => {
    iw = img.naturalWidth; ih = img.naturalHeight; ready = true; base = Math.min(cw / iw, ch / ih);
    $("loading").remove(); start();
  };
  img.onerror = () => { $("loading").textContent = "Could not load img/aerosols_4k.jpg. Run tools/build_grid.py first."; };
  img.src = "img/aerosols_4k.jpg";

  // ---- Hooks for the next build (sound under the view) ----
  const api = window.XMAP = {
    onView: null, onHover: null, flyTo,
    view: () => ({ x: cur.x / iw, y: cur.y / ih, z: cur.z }),
    toImage(cx, cy) { const r = rect(), sc = scaleOf(cur); return { x: (cur.x + (cx - r.left - cw / 2) / sc) / iw, y: (cur.y + (cy - r.top - ch / 2) / sc) / ih }; },
  };
})();