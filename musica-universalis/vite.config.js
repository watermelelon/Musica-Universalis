import { defineConfig } from 'vite';
import { cpSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('.', import.meta.url));
const publicRoot = fileURLToPath(new URL('./public/', import.meta.url));
const distRoot = fileURLToPath(new URL('./dist/', import.meta.url));
const entryHtml = fileURLToPath(
  new URL('./public/index.html', import.meta.url)
);

export default defineConfig({
  root: publicRoot,
  base: './',
  publicDir: false,

  server: {
    fs: { allow: [project] }
  },

  build: {
    outDir: '../dist',
    emptyOutDir: true
  },

  plugins: [{
    name: 'copy-static-assets',

    writeBundle() {
      cpSync(publicRoot, distRoot, {
        recursive: true,
        filter: (source) => source !== entryHtml
      });
    }
  }]
});