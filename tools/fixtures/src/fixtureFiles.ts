import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/**
 * The committed fixtures live at the repository root.
 */
const FIXTURE_ROOT = new URL('../../../test/fixtures/', import.meta.url);

export function fixturePath(relativePath: string): string {
  return fileURLToPath(new URL(relativePath, FIXTURE_ROOT));
}

export async function readFixture(relativePath: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(fixturePath(relativePath)));
}

export function writeFixture(relativePath: string, bytes: Uint8Array): Promise<void> {
  return writeFile(fixturePath(relativePath), bytes);
}
