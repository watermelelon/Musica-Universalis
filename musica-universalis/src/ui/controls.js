export function bindControls({ toggle, seek, reset, configure, changeFrame, contrast, voice }) {
  const $ = id => document.getElementById(id);
  $('play').addEventListener('click', toggle);
  $('reset').addEventListener('click', reset);
  $('timeline').addEventListener('input', event => seek(Number(event.target.value)));
  $('frame').addEventListener('change', event => changeFrame(Number(event.target.value)));
  for (const id of ['tempo', 'volume', 'reverb', 'spatial']) $(id).addEventListener('input', () => {
    $('tempo-value').value = `${$('tempo').value} BPM`;
    $('volume-value').value = `${$('volume').value}%`;
    $('reverb-value').value = `${$('reverb').value}%`;
    configure();
  });
  $('contrast').addEventListener('change', event => contrast(event.target.checked));
  $('voice').addEventListener('change', event => voice(event.target.checked));
  document.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || /INPUT|SELECT|TEXTAREA|BUTTON|A/.test(event.target.tagName)) return;
    if (event.code === 'Space') { event.preventDefault(); toggle(); }
    if (event.code === 'ArrowRight' || event.code === 'ArrowLeft') { event.preventDefault(); seek(Math.max(0, Math.min(Number($('timeline').max), Number($('timeline').value) + (event.code === 'ArrowRight' ? 1 : -1)))); }
  });
}
