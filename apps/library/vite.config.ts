import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

import packageJson from './package.json' with { type: 'json' };

const THIRD_PARTY = Object.keys(packageJson.dependencies);

/**
 * The npm package's code: the player with the core and the adapters bundled in, as ES modules
 * that leave Three.js and mediabunny to the page's own install. Unminified: the page's bundler
 * minifies, and a stack trace into readable code helps whoever debugs it.
 */
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  build: {
    outDir: 'dist',
    target: 'es2022',
    minify: false,
    lib: {
      entry: {
        index: fileURLToPath(new URL('src/index.ts', import.meta.url)),
        define: fileURLToPath(new URL('src/define.ts', import.meta.url)),
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: (id) => THIRD_PARTY.some((name) => id === name || id.startsWith(`${name}/`)),
      // Both entries share one module holding the player; a package needs no hashed names.
      output: { chunkFileNames: 'player.js' },
    },
  },
});
