import path from 'node:path';

import type { Plugin } from 'vite';

import { SAMPLES_ENDPOINT } from '../src/pages/samplesListing.ts';

/**
 * Vite serves any allowed file at this prefix followed by its absolute path.
 */
const FILE_SYSTEM_PREFIX = '/@fs';
const HTTP_NOT_FOUND = 404;

/**
 * Whether `url` asks for the samples' listing or for a file under `samplesRoot`, the catalogue
 * included, however its path is spelled. The file system is compared without case, as macOS
 * keeps it.
 */
export function isSamplesRequest(url: string, samplesRoot: string): boolean {
  const pathname = decodeURIComponent(new URL(url, 'https://dev.invalid').pathname);
  if (pathname === SAMPLES_ENDPOINT) return true;
  if (!pathname.startsWith(`${FILE_SYSTEM_PREFIX}/`)) return false;
  const file = path.posix.normalize(pathname.slice(FILE_SYSTEM_PREFIX.length)).toLowerCase();
  const root = samplesRoot.toLowerCase();
  return file === root || file.startsWith(`${root}/`);
}

/**
 * Dev-server plugin for a server opened to the network without the samples shared: every sample
 * is private (ADR 0031), and the repository the server may read holds the samples' catalogue, so
 * their listing and every file under `samplesRoot` are answered as missing.
 */
export function samplesWithheld(samplesRoot: string): Plugin {
  return {
    name: 'gyroview-samples-withheld',
    configureServer(server): void {
      server.middlewares.use((request, response, next) => {
        if (!isSamplesRequest(request.url ?? '/', samplesRoot)) {
          next();
          return;
        }
        response.statusCode = HTTP_NOT_FOUND;
        response.end();
      });
    },
  };
}
