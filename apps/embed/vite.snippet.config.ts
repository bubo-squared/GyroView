import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

/**
 * `embed.js`: the script-tag snippet exposing `window.GyroView.embed`.
 */
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: fileURLToPath(new URL('src/snippet/embedSnippet.ts', import.meta.url)),
      name: 'GyroView',
      formats: ['iife'],
      fileName: (): string => 'embed.js',
    },
  },
});
