import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
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
 * HTTPS for opening the developer page from a phone on the same network: WebCodecs exists only
 * in secure contexts, and a network address over plain HTTP is not one. Both variables name PEM
 * files of a certificate the phone trusts (CONTRIBUTING); without them the server stays on
 * plain HTTP on this machine alone.
 */
function phoneHttps(): { readonly cert: Buffer; readonly key: Buffer } | undefined {
  const cert = process.env['GYROVIEW_DEV_CERT'];
  const key = process.env['GYROVIEW_DEV_KEY'];
  return cert && key ? { cert: readFileSync(cert), key: readFileSync(key) } : undefined;
}

const https = phoneHttps();

/**
 * The pages: the developer page and the embed target. The two script bundles have their own
 * configurations (`vite.snippet.config.ts`, `vite.component.config.ts`).
 */
export default defineConfig({
  root: APP_ROOT,
  // Pages that find their scripts next to themselves, so the site works under any path, as
  // DEPLOYMENT has it: a versioned folder on a CDN, beside embed.js.
  base: './',
  plugins: [samplesPlugin(SAMPLES_ROOT)],
  server: {
    fs: { allow: [REPOSITORY_ROOT, ...sampleTargets()] },
    ...(https && { https, host: true }),
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
