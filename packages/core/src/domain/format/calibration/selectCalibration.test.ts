import { describe, expect, it } from 'vitest';

import { CalibrationVersion } from './CalibrationVersion';
import { selectCalibration } from './selectCalibration';
import { v6CalibrationString } from '../../../../test/support/calibrationStrings';
import { OFFICE_CALIBRATION } from '../../../../test/support/officeCalibration';

describe('selectCalibration', () => {
  it('prefers the legacy calibration when all three strings exist', () => {
    const choice = selectCalibration({
      offset: OFFICE_CALIBRATION.offset,
      offsetV2: OFFICE_CALIBRATION.offsetV2,
      offsetV3: OFFICE_CALIBRATION.offsetV3,
    });
    expect(choice.calibration?.version).toBe(CalibrationVersion.Legacy);
    expect(choice.warnings).toEqual([]);
  });

  it('falls back to the MEI calibration, then the polynomial, without the legacy string', () => {
    const mei = selectCalibration({
      offset: undefined,
      offsetV2: OFFICE_CALIBRATION.offsetV2,
      offsetV3: OFFICE_CALIBRATION.offsetV3,
    });
    expect(mei.calibration?.version).toBe(CalibrationVersion.Mei);
    const polynomial = selectCalibration({
      offset: undefined,
      offsetV2: OFFICE_CALIBRATION.offsetV2,
      offsetV3: undefined,
    });
    expect(polynomial.calibration?.version).toBe(CalibrationVersion.Polynomial);
  });

  it('skips an unusable v3 string with a warning and uses the next one', () => {
    const choice = selectCalibration({
      offset: undefined,
      offsetV2: OFFICE_CALIBRATION.offsetV2,
      offsetV3: v6CalibrationString(),
    });
    expect(choice.calibration?.version).toBe(CalibrationVersion.Polynomial);
    expect(choice.warnings).toEqual([
      expect.stringMatching(/^offset_v3 skipped: .*v6 layout/) as string,
    ]);
  });

  it('skips a malformed string but propagates programming errors', () => {
    const choice = selectCalibration({
      offset: 'not_a_calibration',
      offsetV2: undefined,
      offsetV3: OFFICE_CALIBRATION.offsetV3,
    });
    expect(choice.calibration?.version).toBe(CalibrationVersion.Mei);
    expect(choice.warnings[0]).toContain('offset skipped');
  });
});
