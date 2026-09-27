import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

/**
 * The notice the standalone file carries for what it bundles: mediabunny's MPL-2.0 asks that
 * whoever receives it in compiled form learns where its source is.
 */
const THIRD_PARTY_NOTICE = `/*! gyroview (MIT). Bundles three.js (MIT, https://github.com/mrdoob/three.js) and
 mediabunny (MPL-2.0, source at https://github.com/Vanilagy/mediabunny). */`;

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
    // The player, Three.js and the demuxer in one module: about 1 MB, 280 kB compressed.
    chunkSizeWarningLimit: 1400,
    lib: {
      entry: fileURLToPath(new URL('src/standalone.ts', import.meta.url)),
      formats: ['es'],
      fileName: (): string => 'standalone.js',
    },
    // After minification, which would drop the notice with every other comment.
    rollupOptions: { output: { postBanner: THIRD_PARTY_NOTICE, minify: true } },
  },
});
