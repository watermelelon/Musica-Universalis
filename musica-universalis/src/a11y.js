export function createAccessibility() {
  const supported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  const voice = document.querySelector('#voice');
  if (!supported) { voice.disabled = true; voice.title = 'Este navegador no admite síntesis de voz'; }
  return {
    announce(text) { document.querySelector('#status').textContent = text; },
    speak(text) {
      if (!supported || !voice.checked) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text); utterance.lang = 'es'; utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    },
    cancel() { if (supported) window.speechSynthesis.cancel(); },
    contrast(value) { document.body.classList.toggle('high-contrast', value); },
  };
}
