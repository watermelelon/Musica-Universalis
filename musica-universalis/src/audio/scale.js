// Escala mayor de afinación justa, expresada respecto de la tónica.
export const RATIOS = [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8];
export function frequencyForRow(row, rows, root = 130.8128) {
  const degree = Math.round((1 - row / Math.max(1, rows - 1)) * 20);
  return root * RATIOS[degree % RATIOS.length] * 2 ** Math.floor(degree / RATIOS.length);
}
export function chordForColumn(frame, column, limit = 5) {
  return frame.cells.map((row, y) => ({ ...row[column], y }))
    .filter(cell => cell.luminance > 0.12)
    .sort((a, b) => b.luminance - a.luminance).slice(0, limit)
    .map(cell => ({ frequency: frequencyForRow(cell.y, frame.cells.length), velocity: 0.12 + cell.luminance * 0.48 }));
}
