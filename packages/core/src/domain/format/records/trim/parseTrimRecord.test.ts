import { describe, expect, it } from 'vitest';

import { parseTrimRecord } from './parseTrimRecord';
import { trimRecord } from '../../../../../test/support/trimRecord';

describe('parseTrimRecord', () => {
  it('reads the frame of the original recording a clip trimmed in the Insta360 app starts at', () => {
    expect(parseTrimRecord(trimRecord(120))).toEqual({ startFrame: 120 });
  });

  it('reads a clip that starts where the original did', () => {
    expect(parseTrimRecord(trimRecord(0))).toEqual({ startFrame: 0 });
  });

  it('reads no trim from a record of another kind or one cut short', () => {
    expect(parseTrimRecord(trimRecord(120, 'XXXX'))).toBeUndefined();
    expect(parseTrimRecord(trimRecord(120).subarray(0, 11))).toBeUndefined();
    expect(parseTrimRecord(new Uint8Array())).toBeUndefined();
  });
});
