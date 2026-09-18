import { describe, expect, it } from 'vitest';

import { ExposureRecord } from './ExposureRecord';
import { microseconds } from '../../../shared/units/time';
import { captureError } from '../../../../test/support/errors';

const record = new ExposureRecord(
  Float64Array.from([100, 200, 300, 400]),
  Float64Array.from([0.1, 0.2, 0.3, 0.4]),
);

describe('ExposureRecord', () => {
  it('exposes entries by index', () => {
    expect(record.entryAt(2)).toEqual({ captureTime: 300, shutterTime: 0.3 });
    expect(record.length).toBe(4);
  });

  it('finds the first entry at or after a capture time', () => {
    expect(record.indexAtOrAfter(microseconds(50))).toBe(0);
    expect(record.indexAtOrAfter(microseconds(200))).toBe(1);
    expect(record.indexAtOrAfter(microseconds(201))).toBe(2);
    expect(record.indexAtOrAfter(microseconds(401))).toBe(4);
  });

  it('slices a range of entries into a new record', () => {
    const slice = record.slice(1, 2);
    expect([...slice.captureTimes]).toEqual([200, 300]);
    expect([...slice.shutterTimes]).toEqual([0.2, 0.3]);
    expect(captureError(() => record.slice(3, 2))).toMatchObject({ code: 'invariant-violation' });
  });

  it('rejects out-of-range indices and mismatched arrays with typed errors', () => {
    expect(captureError(() => record.entryAt(4))).toMatchObject({ code: 'index-out-of-range' });
    expect(
      captureError(() => new ExposureRecord(new Float64Array(2), new Float64Array(1))),
    ).toMatchObject({
      code: 'invariant-violation',
    });
  });
});
