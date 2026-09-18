import { describe, expect, it } from 'vitest';

import { GyroRecordParser } from './GyroRecordParser';
import { FLOAT_SAMPLE_SIZE, RAW_SAMPLE_SIZE } from './gyroLayouts';
import { magnitudeOf } from '../../../shared/math/Vector3';
import { captureError } from '../../../../test/support/errors';
import { loadFixture } from '../../../../test/support/fixtures';

const parser = new GyroRecordParser();
const X5_RANGES = { accelerometerG: 32, gyroscopeDps: 2000 };
const DEGREES_TO_RADIANS = Math.PI / 180;

function encodeFloatSample(
  timestampMs: number,
  acceleration: number[],
  angularVelocity: number[],
): Uint8Array {
  const bytes = new Uint8Array(FLOAT_SAMPLE_SIZE);
  const view = new DataView(bytes.buffer);
  view.setBigUint64(0, BigInt(timestampMs), true);
  for (const [index, value] of acceleration.entries()) view.setFloat64(8 + index * 8, value, true);
  for (const [index, value] of angularVelocity.entries()) {
    view.setFloat64(32 + index * 8, value, true);
  }
  return bytes;
}

describe('GyroRecordParser with the raw X5 layout', () => {
  const track = parser.parse(loadFixture('x5/office/record-03-gyro-first2000.bin'), {
    isRawGyro: true,
    ranges: X5_RANGES,
  });

  it('decodes one sample per 20 bytes', () => {
    expect(track.length).toBe(2000);
  });

  it('reads microsecond timestamps at 1 kHz', () => {
    expect(track.sampleAt(0).timestamp).toBe(921_648_752);
    expect(track.sampleAt(1).timestamp).toBe(921_649_752);
    expect(track.meanSampleInterval).toBeGreaterThan(995);
    expect(track.meanSampleInterval).toBeLessThan(1005);
  });

  it('scales the accelerometer by the 32 g range so gravity reads about 1 g at rest', () => {
    const { acceleration } = track.sampleAt(0);
    expect(acceleration[0]).toBeCloseTo((32_149 - 32_768) * (32 / 32_768), 5);
    expect(acceleration[1]).toBeCloseTo((32_754 - 32_768) * (32 / 32_768), 5);
    expect(acceleration[2]).toBeCloseTo((31_955 - 32_768) * (32 / 32_768), 5);
    expect(magnitudeOf(acceleration)).toBeCloseTo(1, 1);
  });

  it('scales the gyroscope by the 2000 dps range and converts to radians per second', () => {
    const { angularVelocity } = track.sampleAt(0);
    expect(angularVelocity[0]).toBeCloseTo(
      (32_849 - 32_768) * (2000 / 32_768) * DEGREES_TO_RADIANS,
      5,
    );
    expect(angularVelocity[1]).toBeCloseTo(
      (32_697 - 32_768) * (2000 / 32_768) * DEGREES_TO_RADIANS,
      5,
    );
    expect(angularVelocity[2]).toBeCloseTo(
      (32_593 - 32_768) * (2000 / 32_768) * DEGREES_TO_RADIANS,
      5,
    );
  });

  it('reads the last samples of the recording', () => {
    const tail = parser.parse(loadFixture('x5/office/record-03-gyro-last16.bin'), {
      isRawGyro: true,
    });
    expect(tail.length).toBe(16);
    expect(tail.sampleAt(15).timestamp).toBe(1_183_880_765);
  });

  it('falls back to the default 16 g / 2000 dps ranges when none are given', () => {
    const withDefaults = parser.parse(loadFixture('x5/office/record-03-gyro-first2000.bin'), {
      isRawGyro: true,
    });
    expect(withDefaults.sampleAt(0).acceleration[0]).toBeCloseTo(
      (32_149 - 32_768) * (16 / 32_768),
      5,
    );
  });
});

describe('GyroRecordParser with the float layout', () => {
  const payload = new Uint8Array([
    ...encodeFloatSample(1000, [0, 0, -1], [0.1, 0.2, 0.3]),
    ...encodeFloatSample(1002, [0, 0, -1.01], [0.1, 0.2, 0.31]),
  ]);

  it('reads millisecond timestamps as microseconds and float components verbatim', () => {
    const track = parser.parse(payload, { isRawGyro: false });
    expect(track.length).toBe(2);
    expect(track.sampleAt(0).timestamp).toBe(1_000_000);
    expect(track.sampleAt(1).timestamp).toBe(1_002_000);
    expect(track.sampleAt(0).acceleration).toEqual([0, 0, -1]);
    expect(track.sampleAt(1).angularVelocity[2]).toBeCloseTo(0.31, 6);
  });
});

describe('GyroRecordParser layout inference without the info record', () => {
  it('picks the layout whose sample size divides the payload', () => {
    expect(parser.chooseLayout(RAW_SAMPLE_SIZE * 7, {}).name).toBe('raw');
    expect(parser.chooseLayout(FLOAT_SAMPLE_SIZE * 3, {}).name).toBe('float');
  });

  it('refuses to guess when both or neither layout fit', () => {
    expect(
      captureError(() => parser.chooseLayout(RAW_SAMPLE_SIZE * FLOAT_SAMPLE_SIZE, {})),
    ).toMatchObject({
      code: 'invalid-gyro-record',
    });
    expect(captureError(() => parser.chooseLayout(13, {}))).toMatchObject({
      code: 'invalid-gyro-record',
    });
  });

  it('trusts the info record hint over the payload size', () => {
    expect(
      parser.chooseLayout(RAW_SAMPLE_SIZE * FLOAT_SAMPLE_SIZE, { isRawGyro: false }).name,
    ).toBe('float');
  });
});

describe('GyroTrack', () => {
  it('reports emptiness and lacks a sample interval with fewer than two samples', () => {
    const empty = parser.parse(new Uint8Array(), { isRawGyro: true });
    expect(empty.isEmpty).toBe(true);
    expect(empty.meanSampleInterval).toBeUndefined();
  });
});
