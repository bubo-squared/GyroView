import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

/**
 * `gyro-view.js`: the player as one ES module that registers `<gyro-view>` when loaded.
 */
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    // One module holding the player, Three.js and the demuxer: about 1.2 MB, 290 kB compressed.
    chunkSizeWarningLimit: 1400,
    lib: {
      entry: fileURLToPath(new URL('src/component.ts', import.meta.url)),
      formats: ['es'],
      fileName: (): string => 'gyro-view.js',
    },
  },
});
