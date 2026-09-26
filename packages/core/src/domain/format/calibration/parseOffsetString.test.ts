import { describe, expect, it } from 'vitest';

import { CalibrationVersion } from './CalibrationVersion';
import { parseOffsetString } from './parseOffsetString';
import {
  ONE_R_LEGACY_CALIBRATION,
  v6CalibrationString,
} from '../../../../test/support/calibrationStrings';
import { OFFICE_CALIBRATION } from '../../../../test/support/officeCalibration';
import { captureError } from '../../../../test/support/errors';

describe('parseOffsetString with the X5 office strings', () => {
  it('parses the legacy offset into equidistant lenses on a 10752x5376 canvas', () => {
    const set = parseOffsetString(OFFICE_CALIBRATION.offset);
    expect(set.version).toBe(CalibrationVersion.Legacy);
    expect(set.canvas).toEqual({ width: 10_752, height: 5376 });
    expect(set.lenses).toHaveLength(2);
    const [front, back] = set.lenses;
    expect(front?.lensIndex).toBe(0);
    expect(front?.model.kind).toBe('equidistant');
    expect(front?.model.principalPoint).toEqual({ x: 2689.89, y: 2681.94 });
    expect(back?.model.principalPoint).toEqual({ x: 8082.1, y: 2679.47 });
    expect(back?.orientation).toEqual({ yaw: 0.289, pitch: 0.043, roll: 89.987 });
    expect(back?.translation).toEqual([0, 0, 0]);
  });

  it('parses offset_v2 into polynomial lenses with translations', () => {
    const set = parseOffsetString(OFFICE_CALIBRATION.offsetV2);
    expect(set.version).toBe(CalibrationVersion.Polynomial);
    const back = set.lenses[1];
    expect(back?.model.kind).toBe('polynomial');
    expect(back?.translation).toEqual([-0.000907, -0.000055, -0.032061]);
    expect(set.canvas).toEqual({ width: 10_752, height: 5376 });
  });

  it('parses offset_v3 into MEI lenses', () => {
    const set = parseOffsetString(OFFICE_CALIBRATION.offsetV3);
    expect(set.version).toBe(CalibrationVersion.Mei);
    const [front, back] = set.lenses;
    expect(front?.model.kind).toBe('mei');
    expect(front?.model.principalPoint).toEqual({ x: 2689.89, y: 2681.94 });
    expect(front?.orientation).toEqual({ yaw: -0.002, pitch: 0.377, roll: 90.524 });
    expect(back?.translation[2]).toBeCloseTo(-0.032061, 6);
    expect(set.canvas).toEqual({ width: 10_752, height: 5376 });
  });
});

describe('parseOffsetString with the ONE R legacy string', () => {
  it('accepts a version word whose upper bits differ from the X5 and reads the lens type', () => {
    const set = parseOffsetString(ONE_R_LEGACY_CALIBRATION);
    expect(set.version).toBe(CalibrationVersion.Legacy);
    expect(set.canvas).toEqual({ width: 6080, height: 3040 });
    expect(set.lenses[1]?.model.principalPoint).toEqual({ x: 4553.12, y: 1526.43 });
    expect(set.lenses[0]?.orientation.roll).toBe(-179.227);
  });
});

describe('parseOffsetString validation', () => {
  it('rejects a token count matching no layout', () => {
    expect(captureError(() => parseOffsetString('2_1_2_3'))).toMatchObject({
      code: 'invalid-calibration',
    });
  });

  it('rejects a v3 version word that contradicts the layout', () => {
    const tampered = OFFICE_CALIBRATION.offsetV3.replace(/_197632$/, '_132096');
    expect(captureError(() => parseOffsetString(tampered))).toMatchObject({
      code: 'invalid-calibration',
      message: expect.stringContaining('declares version 2') as string,
    });
  });

  it('rejects a v2 version word that contradicts the layout', () => {
    const tampered = OFFICE_CALIBRATION.offsetV2.replace(/_132096$/, '_197632');
    expect(captureError(() => parseOffsetString(tampered))).toMatchObject({
      code: 'invalid-calibration',
    });
  });

  it.each([
    ['a non-numeric token', OFFICE_CALIBRATION.offset.replace('2664.255', 'abc')],
    ['an empty token', OFFICE_CALIBRATION.offset.replace('2664.255', '')],
    ['an infinite token', OFFICE_CALIBRATION.offset.replace('2664.255', 'Infinity')],
  ])('rejects %s', (_case, text) => {
    expect(captureError(() => parseOffsetString(text))).toMatchObject({
      code: 'invalid-calibration',
    });
  });

  it('recognises the v6 layout and reports it as unsupported', () => {
    expect(captureError(() => parseOffsetString(v6CalibrationString()))).toMatchObject({
      code: 'unsupported-calibration',
    });
  });
});
