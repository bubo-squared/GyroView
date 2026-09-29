import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SAMPLES_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../samples');

export const OFFICE_RECORDING = path.join(SAMPLES_ROOT, 'office/VID_20260814_132640_00_013.insv');
export const SAILING_RECORDING = path.join(SAMPLES_ROOT, 'sailing/VID_20260918_082915_00_014.insv');
/**
 * A second recording of the sailing camera unit, smaller than 4 GiB (32-bit chunk offsets).
 */
export const KRNJACA_RECORDING = path.join(
  SAMPLES_ROOT,
  'krnjaca-c2/VID_20260514_131639_00_004.insv',
);
/**
 * An X3 recording split into its two lens files, H.264; only the front file carries a trailer.
 */
export const X3_FRONT_RECORDING = path.join(
  SAMPLES_ROOT,
  'insta360 x3 samples/VID_20231218_150323_00_022.insv',
);
export const X3_BACK_RECORDING = path.join(
  SAMPLES_ROOT,
  'insta360 x3 samples/VID_20231218_150323_10_022.insv',
);

export function hasSamples(): boolean {
  return existsSync(OFFICE_RECORDING) && existsSync(SAILING_RECORDING);
}
