import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

import packageJson from './package.json' with { type: 'json' };

const THIRD_PARTY = Object.keys(packageJson.dependencies);
const REPOSITORY = fileURLToPath(new URL('../..', import.meta.url));

/**
 * The npm package's code: the player with the core and the adapters bundled in, as ES modules
 * that leave Three.js and mediabunny to the page's own install. One file per source module, so
 * a page's bundler drops every module the page does not reach (the manifest's `sideEffects`
 * names `define.js` alone); within one big file it could drop only what it proves pure.
 * Unminified: the page's bundler minifies, and a stack trace into readable code helps whoever
 * debugs it.
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
      // Kept under their paths in the repository, which a package needs no hashes beside.
      output: {
        preserveModules: true,
        preserveModulesRoot: REPOSITORY,
        entryFileNames: '[name].js',
      },
    },
  },
});
