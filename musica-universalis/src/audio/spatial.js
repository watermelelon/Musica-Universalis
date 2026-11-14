import * as Tone from 'tone';
export function createSpatial(output) {
  const panner = new Tone.Panner3D({ panningModel: 'HRTF', positionZ: -1, rolloffFactor: 0 }).connect(output);
  let enabled = true;
  return {
    input: panner,
    move(progress, time = Tone.now()) {
      panner.positionX.linearRampToValueAtTime(enabled ? (progress * 2 - 1) * 2 : 0, time + 0.06);
    },
    setEnabled(value) { enabled = value; if (!value) panner.positionX.rampTo(0, 0.1); },
    dispose() { panner.dispose(); },
  };
}
