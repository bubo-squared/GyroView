import { describe, expect, it } from 'vitest';

import { CalibrationVersion } from '../../optics/LensCalibration';
import { selectCalibration } from './selectCalibration';
import {
  OFFICE_CALIBRATION,
  v6CalibrationString,
} from '../../../../test/support/calibrationStrings';

describe('selectCalibration', () => {
  it('prefers the MEI calibration when all three strings exist', () => {
    const choice = selectCalibration({
      offset: OFFICE_CALIBRATION.offset,
      offsetV2: OFFICE_CALIBRATION.offsetV2,
      offsetV3: OFFICE_CALIBRATION.offsetV3,
    });
    expect(choice.calibration?.version).toBe(CalibrationVersion.Mei);
    expect(choice.warnings).toEqual([]);
  });

  it('falls back to the polynomial calibration when v3 is missing', () => {
    const choice = selectCalibration({
      offset: OFFICE_CALIBRATION.offset,
      offsetV2: OFFICE_CALIBRATION.offsetV2,
      offsetV3: undefined,
    });
    expect(choice.calibration?.version).toBe(CalibrationVersion.Polynomial);
  });

  it('skips an unusable v3 string with a warning and uses the next one', () => {
    const choice = selectCalibration({
      offset: OFFICE_CALIBRATION.offset,
      offsetV2: undefined,
      offsetV3: v6CalibrationString(),
    });
    expect(choice.calibration?.version).toBe(CalibrationVersion.Legacy);
    expect(choice.warnings).toEqual([
      expect.stringMatching(/^offset_v3 skipped: .*v6 layout/) as string,
    ]);
  });

  it('skips a malformed string but propagates programming errors', () => {
    const choice = selectCalibration({
      offset: OFFICE_CALIBRATION.offset,
      offsetV2: 'not_a_calibration',
      offsetV3: undefined,
    });
    expect(choice.calibration?.version).toBe(CalibrationVersion.Legacy);
    expect(choice.warnings[0]).toContain('offset_v2 skipped');
  });
});
