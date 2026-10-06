import { fileURLToPath } from 'node:url';

import { defineConfig, type Plugin } from 'vite';

/**
 * What `embed.js` may weigh: half again its size (about 11 kB), and a hundredth of the player's.
 * Every page that embeds the iframe loads it, and it talks to the frame without the player's
 * code (dependency-cruiser); a change that pulls code in through a shared module fails the build
 * rather than reaching those pages.
 */
const SNIPPET_BUDGET_BYTES = 16_384;

function sizeBudget(limitBytes: number): Plugin {
  return {
    name: 'gyroview-size-budget',
    generateBundle(_options, bundle): void {
      for (const output of Object.values(bundle)) {
        const size = output.type === 'chunk' ? Buffer.byteLength(output.code) : 0;
        if (size > limitBytes) {
          throw new Error(`${output.fileName} is ${size} bytes, over its budget of ${limitBytes}`);
        }
      }
    },
  };
}

/**
 * `embed.js`: the script-tag snippet exposing `window.GyroView.embed`.
 */
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [sizeBudget(SNIPPET_BUDGET_BYTES)],
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
