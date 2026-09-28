import { MISMATCH_CAP, SEAM_BIN_COUNT } from '@gyroview/core';
import { describe, expect, it } from 'vitest';

import { decodeBinCosts } from './decodeBinCosts';
import { RGBA_CHANNELS } from '../../seamMeter/rowMeans';

describe('decodeBinCosts', () => {
  it('reads each candidate row as one cost per bin, the mismatch from two bytes and the validity from one', () => {
    const pixels = new Uint8Array(2 * SEAM_BIN_COUNT * RGBA_CHANNELS);
    // Candidate 1, bin 3: code 0x80_01 of 0xff_ff, validity 51 of 255.
    const offset = (SEAM_BIN_COUNT + 3) * RGBA_CHANNELS;
    pixels.set([0x80, 0x01, 51, 255], offset);
    const [first, second] = decodeBinCosts(pixels, 2);
    expect(first).toHaveLength(SEAM_BIN_COUNT);
    expect(first?.[3]).toEqual({ mismatch: 0, validity: 0 });
    expect(second?.[3]?.mismatch).toBeCloseTo((0x80_01 / 0xff_ff) * MISMATCH_CAP, 9);
    expect(second?.[3]?.validity).toBeCloseTo(0.2, 9);
  });
});
