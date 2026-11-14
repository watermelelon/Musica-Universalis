import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeGrid } from '../src/data.js';

test('carga las capas reales sin modificar los datos originales', () => {
  const source = JSON.parse(readFileSync(new URL('../public/data/grid.json', import.meta.url), 'utf8'));
  const data = normalizeGrid(source);
  assert.equal(data.frames.length, Object.keys(source.layers).length);
  assert.ok(data.frames.every(frame => frame.image === 'img/aerosols.jpg' && frame.cells.length === source.rows));
  assert.equal(data.frames[0].cells[0][0].luminance, Object.values(source.layers)[0][0][0]);
  assert.equal(source.frames, undefined);
});

test('rechaza capas con dimensiones o intensidades incorrectas', () => {
  for (const grid of [[[2]], [[-1]], [[]], [[null]]]) {
    assert.throws(() => normalizeGrid({ cols: 1, rows: 1, layers: { dust: grid } }));
  }
});
