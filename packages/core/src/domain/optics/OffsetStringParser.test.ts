import { describe, expect, it } from 'vitest';

import { OffsetStringParser } from './OffsetStringParser';
import { captureError } from '../../../test/support/errors';
import { OFFICE_CALIBRATION } from '../../../test/support/officeCalibration';

const parser = new OffsetStringParser();

describe('OffsetStringParser with the X5 office strings', () => {
  it('parses the legacy offset into equidistant lenses on a 10752x5376 canvas', () => {
    const set = parser.parse(OFFICE_CALIBRATION.offset);
    expect(set.version).toBe(1);
    expect(set.canvas).toEqual({ width: 10_752, height: 5376 });
    expect(set.lenses).toHaveLength(2);
    const [front, back] = set.lenses;
    expect(front?.model.kind).toBe('equidistant');
    expect(front?.model.principalPoint).toEqual({ x: 2689.89, y: 2681.94 });
    expect(back?.model.principalPoint).toEqual({ x: 8082.1, y: 2679.47 });
    expect(back?.orientation).toEqual({ yaw: 0.289, pitch: 0.043, roll: 89.987 });
    expect(back?.lensType).toBe(113);
    expect(back?.translation).toEqual([0, 0, 0]);
  });

  it('parses offset_v2 into polynomial lenses with translations', () => {
    const set = parser.parse(OFFICE_CALIBRATION.offsetV2);
    expect(set.version).toBe(2);
    const back = set.lenses[1];
    expect(back?.model.kind).toBe('polynomial');
    expect(back?.translation).toEqual([-0.000907, -0.000055, -0.032061]);
    expect(back?.lensType).toBe(113);
    expect(set.canvas).toEqual({ width: 10_752, height: 5376 });
  });

  it('parses offset_v3 into MEI lenses', () => {
    const set = parser.parse(OFFICE_CALIBRATION.offsetV3);
    expect(set.version).toBe(3);
    const [front, back] = set.lenses;
    expect(front?.model.kind).toBe('mei');
    expect(front?.model.principalPoint).toEqual({ x: 2689.89, y: 2681.94 });
    expect(front?.orientation).toEqual({ yaw: -0.002, pitch: 0.377, roll: 90.524 });
    expect(back?.translation[2]).toBeCloseTo(-0.032061, 6);
  });
});

describe('OffsetStringParser validation', () => {
  it('rejects a token count matching no layout', () => {
    expect(captureError(() => parser.parse('2_1_2_3'))).toMatchObject({
      code: 'invalid-calibration',
    });
  });

  it('rejects a version word that contradicts the layout', () => {
    const tampered = OFFICE_CALIBRATION.offsetV3.replace(/_197632$/, '_132096');
    expect(captureError(() => parser.parse(tampered))).toMatchObject({
      code: 'invalid-calibration',
      message: expect.stringContaining('declares version 2') as string,
    });
  });

  it('rejects non-numeric tokens', () => {
    expect(
      captureError(() => parser.parse(OFFICE_CALIBRATION.offset.replace('2664.255', 'abc'))),
    ).toMatchObject({
      code: 'invalid-calibration',
    });
  });

  it('recognises the v6 layout and reports it as unsupported', () => {
    const v6 = ['2', ...Array.from({ length: 54 }, () => '1'), String(6 << 16)].join('_');
    expect(captureError(() => parser.parse(v6))).toMatchObject({ code: 'unsupported-calibration' });
  });
});
