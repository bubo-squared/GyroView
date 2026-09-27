import { describe, expect, it } from 'vitest';

import {
  FLOAT_SAMPLE_SIZE,
  RAW_ACCELERATION_OFFSET,
  RAW_ANGULAR_VELOCITY_OFFSET,
  RAW_COMPONENT_SIZE,
  RAW_SAMPLE_SIZE,
} from './gyroLayouts';
import { parseGyroRecord, selectGyroSampleLayout, type GyroLayoutHints } from './parseGyroRecord';
import { degrees, degreesToRadians } from '../../../../shared/units/angle';
import { captureError } from '../../../../../test/support/errors';
import { loadFixture } from '../../../../../test/support/fixtures';
import {
  OFFICE_FIRST_GYRO_SAMPLE,
  RAW_FULL_SCALE,
  RAW_ZERO_POINT,
} from '../../../../../test/support/officeGyroSample';

const NO_HINTS = { isRawGyro: undefined, ranges: undefined };
const RAW_X5 = { isRawGyro: true, ranges: OFFICE_FIRST_GYRO_SAMPLE.ranges };

function encodeFloatSample(
  timestampMs: number,
  acceleration: number[],
  angularVelocity: number[],
): Uint8Array {
  const bytes = new Uint8Array(FLOAT_SAMPLE_SIZE);
  const view = new DataView(bytes.buffer);
  view.setBigUint64(0, BigInt(timestampMs), true);
  for (const [index, value] of acceleration.entries()) view.setFloat64(8 + index * 8, value, true);
  for (const [index, value] of angularVelocity.entries())
    view.setFloat64(32 + index * 8, value, true);
  return bytes;
}

/**
 * The highest byte of the float64 angular velocity about y; bit 62 lives there.
 */
const ANGULAR_Y_HIGH_BYTE = 32 + 8 + 7;

/**
 * The sample with one bit of one byte flipped, as damage leaves it: bit 62 of a small float64
 * turns it into about 1e307, finite and far past anything a gyroscope measures; bit 15 or 14 of
 * a raw word moves the reading by its range or half of it.
 */
function bitFlipped(sample: Uint8Array, byte: number, mask: number): Uint8Array {
  const flipped = Uint8Array.from(sample);
  flipped[byte] = (flipped[byte] ?? 0) ^ mask;
  return flipped;
}

function encodeRawSample(timestampUs: number): Uint8Array {
  const bytes = new Uint8Array(RAW_SAMPLE_SIZE);
  new DataView(bytes.buffer).setBigUint64(0, BigInt(timestampUs), true);
  return bytes;
}

/**
 * A raw sample reading `acceleration` in g on the X5's 32 g range, and the same raw value
 * `angularVelocity` on every gyroscope axis.
 */
function encodeRawReading(
  timestampUs: number,
  acceleration: readonly number[],
  angularVelocity: number,
): Uint8Array {
  const bytes = encodeRawSample(timestampUs);
  const view = new DataView(bytes.buffer);
  const rawPerG = RAW_FULL_SCALE / RAW_X5.ranges.accelerometerG;
  for (const [axis, g] of acceleration.entries()) {
    const word = RAW_ZERO_POINT + Math.round(g * rawPerG);
    view.setUint16(RAW_ACCELERATION_OFFSET + axis * RAW_COMPONENT_SIZE, word, true);
  }
  for (let axis = 0; axis < 3; axis += 1) {
    const word = RAW_ZERO_POINT + angularVelocity;
    view.setUint16(RAW_ANGULAR_VELOCITY_OFFSET + axis * RAW_COMPONENT_SIZE, word, true);
  }
  return bytes;
}

/**
 * Selects the layout the hints (or the payload) name, then reads the record with it.
 */
function read(payload: Uint8Array, hints: GyroLayoutHints): ReturnType<typeof parseGyroRecord> {
  const layout = selectGyroSampleLayout(hints, payload);
  if (!layout) throw new Error('no layout selected');
  return parseGyroRecord(payload, layout);
}

function scaledRaw(raw: number, range: number): number {
  return ((raw - RAW_ZERO_POINT) * range) / RAW_FULL_SCALE;
}

describe('parseGyroRecord with the raw X5 layout', () => {
  const parsed = read(loadFixture('x5/office/record-03-gyro-first2000.bin'), RAW_X5);
  const { track } = parsed;

  it('decodes one sample per 20 bytes and reports the layout', () => {
    expect(track.length).toBe(2000);
    expect(parsed.layout).toBe('raw');
    expect(parsed.strayBytes).toBe(0);
  });

  it('reads microsecond capture times at about 1 kHz', () => {
    expect(track.sampleAt(0).captureTime).toBe(OFFICE_FIRST_GYRO_SAMPLE.captureTimeUs);
    expect(track.sampleAt(1).captureTime).toBe(OFFICE_FIRST_GYRO_SAMPLE.captureTimeUs + 1000);
    expect(track.meanSampleInterval).toBeGreaterThan(995);
    expect(track.meanSampleInterval).toBeLessThan(1005);
  });

  it('scales the accelerometer by its range so the sample reads about 1 g', () => {
    const { acceleration } = track.sampleAt(0);
    const expected = OFFICE_FIRST_GYRO_SAMPLE.rawAcceleration.map((raw) => scaledRaw(raw, 32));
    for (const [axis, value] of expected.entries())
      expect(acceleration[axis]).toBeCloseTo(value, 5);
    expect(Math.hypot(...acceleration)).toBeCloseTo(1, 1);
  });

  it('scales the gyroscope by its range and converts degrees per second to radians', () => {
    const { angularVelocity } = track.sampleAt(0);
    const expected = OFFICE_FIRST_GYRO_SAMPLE.rawAngularVelocity.map((raw) =>
      degreesToRadians(degrees(scaledRaw(raw, 2000))),
    );
    for (const [axis, value] of expected.entries())
      expect(angularVelocity[axis]).toBeCloseTo(value, 5);
  });

  it('reads the last samples of the recording', () => {
    const tail = read(loadFixture('x5/office/record-03-gyro-last16.bin'), RAW_X5).track;
    expect(tail.length).toBe(16);
    expect(tail.sampleAt(15).captureTime).toBe(1_183_880_765);
  });

  it('falls back to the default 16 g / 2000 dps ranges when none are given', () => {
    const withDefaults = read(loadFixture('x5/office/record-03-gyro-first2000.bin'), {
      isRawGyro: true,
      ranges: undefined,
    }).track;
    expect(withDefaults.sampleAt(0).acceleration[0]).toBeCloseTo(
      scaledRaw(OFFICE_FIRST_GYRO_SAMPLE.rawAcceleration[0], 16),
      5,
    );
  });

  it('takes a range the info record states as zero for none, keeping every sample', () => {
    const parsed = read(loadFixture('x5/office/record-03-gyro-first2000.bin'), {
      isRawGyro: true,
      ranges: { accelerometerG: 0, gyroscopeDps: 0 },
    });
    expect(parsed.damagedSamples).toBe(0);
    expect(parsed.track.sampleAt(0).acceleration[0]).toBeCloseTo(
      scaledRaw(OFFICE_FIRST_GYRO_SAMPLE.rawAcceleration[0], 16),
      5,
    );
  });

  it('leaves out and counts samples whose bytes cannot be a reading, keeping the rest', () => {
    const unsafeStamp = encodeFloatSample(20, [0, 1, 0], [0, 0, 0]);
    unsafeStamp[7] = 0xff;
    const payload = new Uint8Array([
      ...encodeFloatSample(10, [0, 1, 0], [0, 0, 0]),
      ...unsafeStamp,
      ...encodeFloatSample(30, [0, NaN, 0], [0, 0, 0]),
      ...bitFlipped(encodeFloatSample(40, [0, 1, 0], [0, 0.5, 0]), ANGULAR_Y_HIGH_BYTE, 0x40),
      ...encodeFloatSample(50, [0, 1, 0], [0, 0, 0]),
    ]);
    const { track, damagedSamples } = read(payload, { isRawGyro: false, ranges: undefined });
    expect(damagedSamples).toBe(3);
    expect([0, 1].map((index) => track.sampleAt(index).captureTime)).toEqual([10_000, 50_000]);
  });

  it.each([
    ['acceleration about x, its highest bit', RAW_ACCELERATION_OFFSET + 1, 0x80],
    ['angular velocity about z, its second highest bit', RAW_ANGULAR_VELOCITY_OFFSET + 5, 0x40],
  ])('leaves out a raw reading whose %s flipped', (_component, highByte, mask) => {
    const samples = [0, 1, 2, 3, 4].map((index) =>
      encodeRawReading((index + 1) * 10_000, [0, 1, index / 4], index * 10),
    );
    samples[2] = bitFlipped(samples[2] ?? new Uint8Array(), highByte, mask);
    const { track, damagedSamples } = read(new Uint8Array(samples.flatMap((s) => [...s])), RAW_X5);
    expect(damagedSamples).toBe(1);
    expect([...track.captureTimes]).toEqual([10_000, 20_000, 40_000, 50_000]);
    // Each kept sample's readings moved with its stamp.
    const rawPerRadianPerSecond = RAW_FULL_SCALE / degreesToRadians(degrees(2000));
    const kept = [0, 1, 2, 3].map((index) => track.sampleAt(index));
    expect(kept.map((sample) => Math.round(sample.acceleration[2] * 4))).toEqual([0, 1, 3, 4]);
    expect(
      kept.map((sample) => Math.round((sample.angularVelocity[0] * rawPerRadianPerSecond) / 10)),
    ).toEqual([0, 1, 3, 4]);
  });

  it('keeps a knock and a vibration, whose leaps no flipped bit explains', () => {
    const knock = [1, 1, 5, 23, 9, 3, 1];
    const vibration = Array.from(
      { length: 40 },
      (_unused, index) => 10 * Math.sin(index * (Math.PI / 2) + 0.3),
    );
    const payload = new Uint8Array(
      [...knock, ...vibration].flatMap((g, index) => [
        ...encodeRawReading((index + 1) * 1000, [g, 1, 0], 0),
      ]),
    );
    expect(read(payload, RAW_X5).damagedSamples).toBe(0);
  });

  it('mends a stamp far off its neighbours and counts it', () => {
    const stamps = [10, 20, 30, 1_000_040, 50, 60, 70];
    const payload = new Uint8Array(
      stamps.flatMap((stamp) => [...encodeFloatSample(stamp, [0, 1, 0], [0, 0, 0])]),
    );
    const { track, mendedStamps } = read(payload, { isRawGyro: false, ranges: undefined });
    expect(mendedStamps).toBe(1);
    expect([...track.captureTimes]).toEqual([10, 20, 30, 40, 50, 60, 70].map((ms) => ms * 1000));
  });

  it('tolerates and reports a partial trailing sample, as ONE R recordings have', () => {
    const payload = new Uint8Array(RAW_SAMPLE_SIZE * 3 + 1);
    payload.set(encodeRawSample(1000), 0);
    payload.set(encodeRawSample(2000), RAW_SAMPLE_SIZE);
    payload.set(encodeRawSample(3000), 2 * RAW_SAMPLE_SIZE);
    const parsed = read(payload, { isRawGyro: true, ranges: undefined });
    expect(parsed.track.length).toBe(3);
    expect(parsed.strayBytes).toBe(1);
  });
});

describe('parseGyroRecord with the float layout', () => {
  const payload = new Uint8Array([
    ...encodeFloatSample(1000, [0, 0, -1], [0.1, 0.2, 0.3]),
    ...encodeFloatSample(1002, [0, 0, -1.01], [0.1, 0.2, 0.31]),
  ]);

  it('reads millisecond timestamps as microseconds and float components verbatim', () => {
    const { track, layout } = read(payload, { isRawGyro: false, ranges: undefined });
    expect(layout).toBe('float');
    expect(track.length).toBe(2);
    expect(track.sampleAt(0).captureTime).toBe(1_000_000);
    expect(track.sampleAt(1).captureTime).toBe(1_002_000);
    expect(track.sampleAt(0).acceleration).toEqual([0, 0, -1]);
    expect(track.sampleAt(1).angularVelocity[2]).toBeCloseTo(0.31, 6);
  });
});

describe('selectGyroSampleLayout', () => {
  it('recognises raw samples by their microsecond spacing', () => {
    const payload = new Uint8Array([...encodeRawSample(5_000_000), ...encodeRawSample(5_001_000)]);
    expect(selectGyroSampleLayout(NO_HINTS, payload)?.name).toBe('raw');
  });

  it('tells raw samples despite a stamp left at zero and one glitched among the first', () => {
    const stamps = Array.from({ length: 32 }, (_unused, index) => 5_000_000 + index * 1000);
    stamps[0] = 0;
    const glitched = encodeRawSample(stamps[5] ?? 0);
    glitched[7] = 0xff;
    const payload = new Uint8Array(
      stamps.flatMap((stamp, index) => [...(index === 5 ? glitched : encodeRawSample(stamp))]),
    );
    expect(selectGyroSampleLayout(NO_HINTS, payload)?.name).toBe('raw');
  });

  it('recognises float samples by their millisecond spacing', () => {
    const payload = new Uint8Array([
      ...encodeFloatSample(5000, [0, 0, 1], [0, 0, 0]),
      ...encodeFloatSample(5001, [0, 0, 1], [0, 0, 0]),
    ]);
    expect(selectGyroSampleLayout(NO_HINTS, payload)?.name).toBe('float');
  });

  it('refuses to guess from a single sample or implausible timestamps', () => {
    expect(
      captureError(() => selectGyroSampleLayout(NO_HINTS, encodeRawSample(1000))),
    ).toMatchObject({ code: 'unsupported-gyro-record' });
    const garbage = new Uint8Array(FLOAT_SAMPLE_SIZE * 2).fill(0xff);
    expect(captureError(() => selectGyroSampleLayout(NO_HINTS, garbage))).toMatchObject({
      code: 'unsupported-gyro-record',
    });
  });

  it('trusts the info record hint over the payload contents', () => {
    const payload = new Uint8Array(RAW_SAMPLE_SIZE * FLOAT_SAMPLE_SIZE);
    expect(selectGyroSampleLayout({ isRawGyro: false, ranges: undefined }, payload)?.name).toBe(
      'float',
    );
  });

  it('selects nothing with neither a hint nor a record to look at', () => {
    expect(selectGyroSampleLayout(NO_HINTS, undefined)).toBeUndefined();
  });

  it('decodes an empty payload to an empty track when the layout is known', () => {
    expect(read(new Uint8Array(), { isRawGyro: true, ranges: undefined }).track.isEmpty).toBe(true);
  });
});
