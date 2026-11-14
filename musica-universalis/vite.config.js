import { defineConfig } from 'vite';
import { cpSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  root: fileURLToPath(new URL('./public', import.meta.url)),
  base: './',
  publicDir: false,
  server: { fs: { allow: [project] } },
  build: { outDir: '../dist', emptyOutDir: true },
  plugins: [{
    name: 'copy-grid-and-images',
    writeBundle() {
      for (const directory of ['data', 'img']) {
        cpSync(new URL(`./public/${directory}`, import.meta.url), new URL(`./dist/${directory}`, import.meta.url), { recursive: true });
      }
    },
  }],
});
