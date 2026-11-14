import * as Tone from 'tone';
import { chordForColumn } from './scale.js';
import { createSpatial } from './spatial.js';
export class AudioEngine {
  constructor(onStep) { this.onStep = onStep; this.column = 0; this.ready = false; this.playing = false; }
  async init() {
    await Tone.start();
    if (this.ready) return;
    this.master = new Tone.Volume(-13).connect(new Tone.Limiter(-2).toDestination());
    this.reverb = new Tone.Reverb({ decay: 4, wet: 0.45 }).connect(this.master);
    await this.reverb.ready;
    this.spatial = createSpatial(this.reverb);
    this.synth = new Tone.PolySynth({ voice: Tone.Synth, maxPolyphony: 48, options: { oscillator: { type: 'sine' }, envelope: { attack: 0.035, decay: 0.3, sustain: 0.15, release: 1.2 } } }).connect(this.spatial.input);
    this.drone = new Tone.Synth({ oscillator: { type: 'sine' }, volume: -22, envelope: { attack: 1, release: 0.7 } }).connect(this.master);
    this.transport = Tone.getTransport();
    this.event = this.transport.scheduleRepeat(time => {
      const col = this.column;
      this.soundColumn(col, time);
      Tone.getDraw().schedule(() => { if (this.playing) this.onStep(col); }, time);
      this.column = (col + 1) % this.frame.cells[0].length;
    }, '8n');
    this.ready = true;
  }
  setFrame(frame) { this.frame = frame; this.column = 0; if (this.ready) this.synth.releaseAll(); }
  soundColumn(column, time = Tone.now()) {
    if (!this.ready || !this.frame) return;
    this.spatial.move(column / Math.max(1, this.frame.cells[0].length - 1), time);
    for (const note of chordForColumn(this.frame, column)) this.synth.triggerAttackRelease(note.frequency, '8n', time, note.velocity);
  }
  play() { if (this.playing) return; this.playing = true; this.drone.triggerAttack(65.4064); this.transport.start(); }
  pause() { if (!this.ready) return; this.playing = false; this.transport.pause(); this.synth.releaseAll(); this.drone.triggerRelease(); }
  seek(column) { this.column = column; if (this.ready && !this.playing) this.soundColumn(column); }
  configure({ tempo, volume, reverb, spatial }) {
    if (!this.ready) return;
    this.transport.bpm.value = tempo;
    this.master.volume.rampTo(volume === 0 ? -Infinity : -9 + 20 * Math.log10(volume / 100), 0.1);
    this.reverb.wet.rampTo(reverb / 100, 0.1);
    this.spatial.setEnabled(spatial);
  }
}
