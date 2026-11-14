export function createMap(canvas) {
  const ctx = canvas.getContext('2d');
  let frame, image, column = 0, contrast = false;
  function draw() {
    const { width, height } = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#080e18'; ctx.fillRect(0, 0, width, height);
    if (!frame) return;
    if (image?.complete && image.naturalWidth) { ctx.globalAlpha = contrast ? 0.35 : 0.72; ctx.drawImage(image, 0, 0, width, height); ctx.globalAlpha = 1; }
    const rows = frame.cells.length, cols = frame.cells[0].length;
    const cw = width / cols, ch = height / rows;
    frame.cells.forEach((row, y) => row.forEach((cell, x) => {
      const active = x === column;
      ctx.fillStyle = active ? `rgba(185,242,206,${0.1 + cell.luminance * 0.6})` : `rgba(136,163,201,${0.06 + cell.luminance * 0.28})`;
      ctx.fillRect(x * cw + 1, y * ch + 1, Math.max(1, cw - 2), Math.max(1, ch - 2));
      if (cell.luminance > 0.3) { ctx.beginPath(); ctx.arc((x + 0.5) * cw, (y + 0.5) * ch, Math.max(0.7, cell.luminance * 2), 0, Math.PI * 2); ctx.fillStyle = active ? '#d6ffe5' : '#b9c6df'; ctx.fill(); }
    }));
    const sx = (column + 0.5) * cw;
    const glow = ctx.createLinearGradient(sx - 25, 0, sx + 25, 0); glow.addColorStop(0, '#b9f2ce00'); glow.addColorStop(0.5, '#b9f2ce20'); glow.addColorStop(1, '#b9f2ce00');
    ctx.fillStyle = glow; ctx.fillRect(sx - 25, 0, 50, height);
    ctx.strokeStyle = '#b9f2ce'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, height); ctx.stroke();
  }
  const observer = new ResizeObserver(draw); observer.observe(canvas);
  return {
    setFrame(value) { frame = value; column = 0; const next = new Image(); image = next; next.onload = () => { if (image === next) draw(); }; next.onerror = draw; next.src = `${import.meta.env.BASE_URL}${frame.image}`; draw(); },
    setColumn(value) { column = value; draw(); },
    setContrast(value) { contrast = value; draw(); },
  };
}
