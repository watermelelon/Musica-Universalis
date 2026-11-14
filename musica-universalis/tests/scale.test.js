import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frequencyForRow, chordForColumn } from '../src/audio/scale.js';

test('la escala cubre octavas justas y aumenta hacia arriba', () => {
  assert.equal(frequencyForRow(20, 21, 100), 100);
  assert.equal(frequencyForRow(13, 21, 100), 200);
  assert.equal(frequencyForRow(6, 21, 100), 400);
  assert.ok(frequencyForRow(0, 21) > frequencyForRow(20, 21));
});
test('un acorde limita voces, omite oscuridad y prioriza las celdas luminosas', () => {
  const frame = { cells: [0, 0.1, 0.2, 0.5, 0.8, 1].map(luminance => [{ luminance }]) };
  const chord = chordForColumn(frame, 0, 3);
  assert.equal(chord.length, 3);
  assert.equal(chord[0].velocity, 0.6);
  assert.ok(chord.every(n => Number.isFinite(n.frequency) && n.velocity > 0));
  assert.deepEqual(chordForColumn({ cells: [[{ luminance: 0 }]] }, 0), []);
});
