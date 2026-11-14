const LAYER_NAMES = { seasalt: 'Sal marina', dust: 'Polvo', smoke: 'Humo', sulfate: 'Sulfatos' };

// Conserva el JSON de capas y adapta cada una al instrumento existente.
export function normalizeGrid(data) {
  if (data.frames) return data;
  if (!Number.isInteger(data.cols) || data.cols < 1 || !Number.isInteger(data.rows) || data.rows < 1 || !data.layers || typeof data.layers !== 'object') throw new Error('Cuadrícula de aerosoles no válida');
  const frames = Object.entries(data.layers).map(([id, grid]) => {
    if (!Array.isArray(grid) || grid.length !== data.rows || grid.some(row => !Array.isArray(row) || row.length !== data.cols || row.some(value => !Number.isFinite(value) || value < 0 || value > 1))) throw new Error(`Capa no válida: ${id}`);
    return {
      id, title: `Aerosoles · ${LAYER_NAMES[id] || id}`,
      description: `${LAYER_NAMES[id] || id}. Intensidad relativa extraída del color de la imagen. Fuente: ${data.source || 'imagen local'}.`,
      image: 'img/aerosols.jpg',
      cells: grid.map(row => row.map(luminance => ({ luminance }))),
    };
  });
  return { ...data, version: 1, frames };
}
