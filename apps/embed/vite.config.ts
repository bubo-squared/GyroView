import { existsSync, readdirSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

import { samplesPlugin } from './dev/samplesPlugin.ts';

const APP_ROOT = fileURLToPath(new URL('.', import.meta.url));
const REPOSITORY_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SAMPLES_ROOT = path.join(REPOSITORY_ROOT, 'samples');

/**
 * `samples/*` are symlinks to folders outside the repository; Vite serves a file only when its
 * real path is allowed.
 */
function sampleTargets(): string[] {
  const entries = existsSync(SAMPLES_ROOT) ? readdirSync(SAMPLES_ROOT) : [];
  return entries
    .map((entry) => path.join(SAMPLES_ROOT, entry))
    .filter((entry) => existsSync(entry))
    .map((entry) => realpathSync(entry));
}

/**
 * The pages: the developer page and the embed target. The two script bundles have their own
 * configurations (`vite.snippet.config.ts`, `vite.component.config.ts`).
 */
export default defineConfig({
  root: APP_ROOT,
  plugins: [samplesPlugin(SAMPLES_ROOT)],
  server: {
    fs: { allow: [REPOSITORY_ROOT, ...sampleTargets()] },
  },
  build: {
    outDir: 'dist',
    // The player chunk carries Three.js and the demuxer: about 1 MB, 270 kB compressed.
    chunkSizeWarningLimit: 1400,
    rollupOptions: {
      input: {
        index: path.join(APP_ROOT, 'index.html'),
        embed: path.join(APP_ROOT, 'embed.html'),
      },
    },
  },
});
