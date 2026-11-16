
import { defineConfig } from 'vite';
import { cpSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Project directories
const project = fileURLToPath(new URL('.', import.meta.url));
const publicRoot = fileURLToPath(new URL('./public/', import.meta.url));
const distRoot = fileURLToPath(new URL('./dist/', import.meta.url));

// HTML entry points
const entryHtml = fileURLToPath(
  new URL('./public/index.html', import.meta.url)
);

const exploreHtml = fileURLToPath(
  new URL('./public/explore.html', import.meta.url)
);

const concertHtml = fileURLToPath(
  new URL('./public/concert.html', import.meta.url)
);

// Prevent Vite's generated HTML from being overwritten
const htmlEntries = new Set([
  entryHtml,
  exploreHtml,
  concertHtml
]);

export default defineConfig({
  root: publicRoot,
  base: './',
  publicDir: false,

  server: {
    fs: {
      allow: [project]
    }
  },

  build: {
    outDir: '../dist',
    emptyOutDir: true,

    rollupOptions: {
      input: {
        main: entryHtml,
        explore: exploreHtml,
        concert: concertHtml
      }
    }
  },

  plugins: [
    {
      name: 'copy-static-assets',
      apply: 'build',

      writeBundle() {
        cpSync(publicRoot, distRoot, {
          recursive: true,
          filter: (source) => !htmlEntries.has(source)
        });
      }
    }
  ]
});
