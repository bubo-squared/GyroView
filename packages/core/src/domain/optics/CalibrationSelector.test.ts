import { describe, expect, it } from 'vitest';

import { CalibrationSelector } from './CalibrationSelector';
import { captureError } from '../../../test/support/errors';
import { OFFICE_CALIBRATION } from '../../../test/support/officeCalibration';

const selector = new CalibrationSelector();

describe('CalibrationSelector', () => {
  it('prefers the MEI calibration when all three strings exist', () => {
    const choice = selector.select({
      offset: OFFICE_CALIBRATION.offset,
      offsetV2: OFFICE_CALIBRATION.offsetV2,
      offsetV3: OFFICE_CALIBRATION.offsetV3,
    });
    expect(choice.calibration.version).toBe(3);
    expect(choice.warnings).toEqual([]);
  });

  it('falls back to the polynomial calibration when v3 is missing', () => {
    const choice = selector.select({
      offset: OFFICE_CALIBRATION.offset,
      offsetV2: OFFICE_CALIBRATION.offsetV2,
      offsetV3: undefined,
    });
    expect(choice.calibration.version).toBe(2);
  });

  it('skips an unusable v3 string with a warning and uses the next one', () => {
    const v6 = ['2', ...Array.from({ length: 54 }, () => '1'), String(6 << 16)].join('_');
    const choice = selector.select({
      offset: OFFICE_CALIBRATION.offset,
      offsetV2: undefined,
      offsetV3: v6,
    });
    expect(choice.calibration.version).toBe(1);
    expect(choice.warnings).toHaveLength(1);
    expect(choice.warnings[0]).toContain('offset_v3 skipped');
  });

  it('fails with a typed error when nothing usable exists', () => {
    expect(
      captureError(() =>
        selector.select({ offset: undefined, offsetV2: undefined, offsetV3: undefined }),
      ),
    ).toMatchObject({ code: 'no-calibration' });
  });
});
