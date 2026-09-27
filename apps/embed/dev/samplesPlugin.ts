import type { ServerResponse } from 'node:http';

import type { Plugin } from 'vite';

import { listSampleFolders, type SampleFolder } from './listSamples';
import { SAMPLES_ENDPOINT, type SampleFolderListing } from '../src/pages/samplesListing.ts';

/**
 * Vite serves any allowed file at this prefix followed by its absolute path, with byte ranges.
 */
const FILE_SYSTEM_PREFIX = '/@fs';
const HTTP_INTERNAL_SERVER_ERROR = 500;

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
        void answerListing(samplesRoot, response);
      });
    },
  };
}

/**
 * A folder that vanishes while listed answers the page with the failure rather than leaving it
 * waiting.
 */
async function answerListing(samplesRoot: string, response: ServerResponse): Promise<void> {
  try {
    const folders = await listSampleFolders(samplesRoot);
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(folders.map((folder) => listingOf(folder))));
  } catch (error) {
    response.statusCode = HTTP_INTERNAL_SERVER_ERROR;
    response.end(String(error));
  }
}

function listingOf(folder: SampleFolder): SampleFolderListing {
  return {
    folder: folder.folder,
    files: folder.files.map((file) => ({
      name: file.name,
      url: `${FILE_SYSTEM_PREFIX}${file.realPath}`,
    })),
  };
}
