import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  parseLocalCatalogue,
  type LocalSampleEntry,
  type ServedLocalSample,
} from './localSampleCatalogue.ts';
import { SAMPLES_ROOT } from './samples.ts';

const CATALOGUE = path.join(SAMPLES_ROOT, 'catalogue.json');

/**
 * The local samples this machine has, none where it has no catalogue (as in CI).
 */
export function localSampleEntries(): readonly LocalSampleEntry[] {
  return existsSync(CATALOGUE)
    ? parseLocalCatalogue(JSON.parse(readFileSync(CATALOGUE, 'utf8')))
    : [];
}

/**
 * Where a local sample's recording lies on disk, through the `samples/` symlink.
 */
export function recordingPathOf(entry: LocalSampleEntry): string {
  return path.join(SAMPLES_ROOT, entry.folder, entry.recording);
}

/**
 * The real folder of a local sample, which Vite must be allowed to serve.
 */
export function realFolderOf(entry: LocalSampleEntry): string {
  return realpathSync(path.join(SAMPLES_ROOT, entry.folder));
}

/**
 * A local sample as the browser tests receive it: Vite serves a file outside the project's root
 * under `/@fs/` and its real absolute path.
 */
export function servedLocalSample(entry: LocalSampleEntry): ServedLocalSample {
  const recording = realpathSync(recordingPathOf(entry));
  return { ...entry, url: `/@fs${pathToFileURL(recording).pathname}` };
}
