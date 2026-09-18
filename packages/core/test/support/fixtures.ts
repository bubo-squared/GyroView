import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../test/fixtures',
);

/**
 * Loads a committed byte fixture cut from a real recording (see test/fixtures/x5/manifest.json).
 */
export function loadFixture(relativePath: string): Uint8Array {
  return new Uint8Array(readFileSync(path.resolve(FIXTURE_ROOT, relativePath)));
}

export interface FixtureRecord {
  format: number;
  size: number;
  offset: number;
  rel: number;
}

export interface FixtureManifestEntry {
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
