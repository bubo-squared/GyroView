import { describe, expect, it } from 'vitest';

import { CalibrationVersion } from './CalibrationVersion';
import { extendedMeiLayout, MEI_CALIBRATION_LAYOUT } from './layouts/MeiCalibrationLayout';
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

  it('parses offset_v6 into Mei lenses of five radial terms and one tangential pair', () => {
    const set = parseOffsetString(OFFICE_CALIBRATION.offsetV6);
    expect(set.version).toBe(CalibrationVersion.ExtendedMei);
    expect(set.canvas).toEqual({ width: 10_752, height: 5376 });
    const [front, back] = set.lenses;
    expect(front?.model.principalPoint).toEqual({ x: 2688.74, y: 2680.4 });
    expect(front?.orientation).toEqual({ yaw: -0.007, pitch: 0.396, roll: 90.543 });
    expect(back?.translation[2]).toBeCloseTo(-0.0313, 3);
    const projection = front?.model.projection;
    if (projection?.kind !== 'mei') throw new Error('the front lens is not a Mei lens');
    expect(projection.xi).toBe(2);
    expect(projection.distortion.radial).toHaveLength(5);
    expect(projection.distortion.tangential).toHaveLength(1);
    expect(projection.distortion.thinPrism).toEqual([]);
  });

  it('draws v6 lenses further out than read, as measured for the v6 reading; v3 lenses as read', () => {
    expect(parseOffsetString(OFFICE_CALIBRATION.offsetV6).radialScale).toBeGreaterThan(1);
    expect(parseOffsetString(OFFICE_CALIBRATION.offsetV3).radialScale).toBe(1);
  });

  it('agrees with offset_v3 on the tokens the two strings share', () => {
    const [v3Front, v3Back] = parseOffsetString(OFFICE_CALIBRATION.offsetV3).lenses;
    const [v6Front, v6Back] = parseOffsetString(OFFICE_CALIBRATION.offsetV6).lenses;
    for (const [v3, v6] of [
      [v3Front, v6Front],
      [v3Back, v6Back],
    ] as const) {
      if (!v3 || !v6) throw new Error('a lens is missing');
      expect(Math.abs(v6.model.principalPoint.x - v3.model.principalPoint.x)).toBeLessThan(2);
      expect(Math.abs(v6.model.principalPoint.y - v3.model.principalPoint.y)).toBeLessThan(2);
      expect(Math.abs(v6.orientation.roll - v3.orientation.roll)).toBeLessThan(0.1);
    }
  });
});

describe('parseOffsetString with a v6 string of the X6 shape', () => {
  it('reads two lenses in the two 7744-pixel squares of a 15488 x 7744 canvas', () => {
    const set = parseOffsetString(v6CalibrationString());
    expect(set.version).toBe(CalibrationVersion.ExtendedMei);
    expect(set.canvas).toEqual({ width: 15_488, height: 7744 });
    expect(set.lenses.map((lens) => lens.model.principalPoint)).toEqual([
      { x: 3872, y: 3872 },
      { x: 11_616, y: 3872 },
    ]);
  });

  it('reads the distortion tokens through the reading it is given', () => {
    const everyToken = extendedMeiLayout(({ radial, tangential, thinPrism }) => {
      const [p1, p2, p3, p4] = tangential;
      const [s1, s2, s3, s4] = thinPrism;
      return {
        radial,
        tangential: [
          { p1, p2 },
          { p1: p3, p2: p4 },
        ],
        thinPrism: [
          { x: s1, y: s2 },
          { x: s3, y: s4 },
        ],
      };
    });
    const projection = parseOffsetString(v6CalibrationString(), [everyToken]).lenses[0]?.model
      .projection;
    expect(projection?.kind === 'mei' && projection.distortion).toEqual({
      radial: [0.2, 1, 0, -4, 0],
      tangential: [
        { p1: 0.001, p2: -0.001 },
        { p1: 0.01, p2: 0.01 },
      ],
      thinPrism: [
        { x: 0.001, y: 0 },
        { x: 0.01, y: -0.01 },
      ],
    });
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

  it('rejects a v6 version word that contradicts the layout', () => {
    const tampered = OFFICE_CALIBRATION.offsetV6.replace(/_394240$/, '_197632');
    expect(captureError(() => parseOffsetString(tampered))).toMatchObject({
      code: 'invalid-calibration',
      message: expect.stringContaining('declares version 3') as string,
    });
  });

  it.each([
    ['no lens, a string the legacy layout would take', '0_10752_5376_1137'],
    ['a canvas without area', OFFICE_CALIBRATION.offset.replace('_10752_5376_', '_0_5376_')],
    ['a lens of radius 0', OFFICE_CALIBRATION.offset.replace('2_2664.255_', '2_0_')],
    [
      'a lens of negative focal length',
      OFFICE_CALIBRATION.offsetV6.replace(/^2_([^_]+)_[^_]+_/, '2_$1_-1_'),
    ],
  ])('rejects a string that parses but describes %s', (_case, text) => {
    expect(captureError(() => parseOffsetString(text))).toMatchObject({
      code: 'invalid-calibration',
    });
  });

  it('matches no layout among those it is given', () => {
    expect(
      captureError(() => parseOffsetString(OFFICE_CALIBRATION.offsetV6, [MEI_CALIBRATION_LAYOUT])),
    ).toMatchObject({ code: 'invalid-calibration' });
  });
});
