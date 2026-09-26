import type { Plugin } from 'vite';

import { listSampleFolders } from './listSamples';
import { SAMPLES_ENDPOINT, type SampleFolderListing } from '../src/pages/samplesListing.ts';

/**
 * Vite serves any allowed file at this prefix followed by its absolute path, with byte ranges.
 */
const FILE_SYSTEM_PREFIX = '/@fs';

/**
 * Dev-server plugin: `/samples.json` lists the local sample folders under `samplesRoot` with
 * URLs the dev page can hand to the player. The files themselves come through Vite's own file
 * serving, which honours Range requests; `server.fs.allow` must include their real folders.
 */
export function samplesPlugin(samplesRoot: string): Plugin {
  return {
    name: 'gyroview-samples',
    configureServer(server): void {
      server.middlewares.use(SAMPLES_ENDPOINT, (_request, response) => {
        void listSampleFolders(samplesRoot).then((folders) => {
          const entries: SampleFolderListing[] = folders.map((folder) => ({
            folder: folder.folder,
            files: folder.files.map((file) => ({
              name: file.name,
              url: `${FILE_SYSTEM_PREFIX}${file.realPath}`,
            })),
          }));
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify(entries));
        });
      });
    },
  };
}
