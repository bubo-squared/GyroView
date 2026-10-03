import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * `samples/` at the repository's root: the symlinks to the local recordings and the catalogue.
 */
export const SAMPLES_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../samples',
);

export const OFFICE_RECORDING = path.join(SAMPLES_ROOT, 'office/VID_20260814_132640_00_013.insv');
export const SAILING_RECORDING = path.join(SAMPLES_ROOT, 'sailing/VID_20260918_082915_00_014.insv');
/**
 * A second recording of the sailing camera unit, smaller than 4 GiB (32-bit chunk offsets).
 */
export const KRNJACA_RECORDING = path.join(
  SAMPLES_ROOT,
  'krnjaca-c2/VID_20260514_131639_00_004.insv',
);
export function hasSamples(): boolean {
  return existsSync(OFFICE_RECORDING) && existsSync(SAILING_RECORDING);
}
