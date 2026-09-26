import { describe, expect, it } from 'vitest';

import { GyroTrack } from './GyroTrack';
import { captureError } from '../../../../test/support/errors';

const track = new GyroTrack(
  Float64Array.from([1000, 2000, 3000]),
  Float32Array.from([0, 0, 1, 0, 0, 1.5, 0, 0, 2]),
  Float32Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9]),
);

describe('GyroTrack', () => {
  it('exposes samples by index with capture time and both vectors', () => {
    expect(track.sampleAt(1)).toEqual({
      captureTime: 2000,
      acceleration: [0, 0, 1.5],
      angularVelocity: [4, 5, 6],
    });
  });

  it('exposes a read-only view of its capture times', () => {
    expect([...track.captureTimes]).toEqual([1000, 2000, 3000]);
  });

  it('reports length, emptiness and the mean sample interval', () => {
    expect(track.length).toBe(3);
    expect(track.isEmpty).toBe(false);
    expect(track.meanSampleInterval).toBe(1000);
    const pair = new GyroTrack(
      Float64Array.from([0, 250]),
      new Float32Array(6),
      new Float32Array(6),
    );
    expect(pair.meanSampleInterval).toBe(250);
    const empty = new GyroTrack(new Float64Array(), new Float32Array(), new Float32Array());
    expect(empty.isEmpty).toBe(true);
    expect(empty.meanSampleInterval).toBeUndefined();
    expect(
      new GyroTrack(Float64Array.from([5]), new Float32Array(3), new Float32Array(3))
        .meanSampleInterval,
    ).toBeUndefined();
  });

  it('rejects out-of-range and fractional indices with a typed error', () => {
    expect(captureError(() => track.sampleAt(3))).toMatchObject({ code: 'index-out-of-range' });
    expect(captureError(() => track.sampleAt(-1))).toMatchObject({ code: 'index-out-of-range' });
    expect(captureError(() => track.sampleAt(0.5))).toMatchObject({ code: 'index-out-of-range' });
  });

  it('rejects arrays that disagree on the sample count', () => {
    expect(
      captureError(
        () => new GyroTrack(new Float64Array(2), new Float32Array(6), new Float32Array(3)),
      ),
    ).toMatchObject({
      code: 'invariant-violation',
    });
  });
});
