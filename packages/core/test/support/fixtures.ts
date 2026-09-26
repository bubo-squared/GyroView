import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Fixtures live at the repository root. Walk up from this file until the workspace manifest
 * appears, so the same code works from the package directory and from Stryker's sandbox copy.
 */
function findWorkspaceRoot(start: string): string {
  let directory = start;
  while (!existsSync(path.join(directory, 'pnpm-workspace.yaml'))) {
    const parent = path.dirname(directory);
    if (parent === directory) throw new Error(`no pnpm-workspace.yaml above ${start}`);
    directory = parent;
  }
  return directory;
}

const THIS_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = path.join(findWorkspaceRoot(THIS_DIRECTORY), 'test/fixtures');

/**
 * Loads a committed byte fixture cut from a real recording (see test/fixtures/x5/manifest.json).
 */
export function loadFixture(relativePath: string): Uint8Array {
  return new Uint8Array(readFileSync(path.resolve(FIXTURE_ROOT, relativePath)));
}

interface FixtureRecord {
  format: number;
  size: number;
  offset: number;
  rel: number;
}

interface FixtureManifestEntry {
  source: string;
  fileSize: number;
  trailerSize: number;
  trailerVersion: number;
  payloadStart: number;
  indexOffset: number;
  indexSize: number;
  records: Record<string, FixtureRecord>;
}

export function loadManifest(): Record<'office' | 'sailing', FixtureManifestEntry> {
  return JSON.parse(readFileSync(path.resolve(FIXTURE_ROOT, 'x5/manifest.json'), 'utf8')) as Record<
    'office' | 'sailing',
    FixtureManifestEntry
  >;
}

interface BoxHeaderFixture {
  type: string;
  offset: number;
  size: number;
  headerSize: number;
  headerHex: string;
}

export function loadBoxHeaders(sample: 'office' | 'sailing'): {
  fileSize: number;
  boxes: BoxHeaderFixture[];
} {
  return JSON.parse(
    readFileSync(path.resolve(FIXTURE_ROOT, `x5/${sample}/box-headers.json`), 'utf8'),
  ) as { fileSize: number; boxes: BoxHeaderFixture[] };
}
