import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

import { NOTICED_OUTPUT } from './thirdPartyNotice';

/**
 * `dist/standalone.js`: the package with Three.js and mediabunny inside, one minified ES module
 * for a page that has no bundler to resolve them. Built after the main build, beside it.
 */
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'es2022',
    minify: true,
    // The player, Three.js and mediabunny in one module: about 1 MB, 260 kB compressed.
    chunkSizeWarningLimit: 1400,
    lib: {
      entry: fileURLToPath(new URL('src/standalone.ts', import.meta.url)),
      formats: ['es'],
      fileName: (): string => 'standalone.js',
    },
    rollupOptions: { output: { ...NOTICED_OUTPUT, minify: true } },
  },
});
