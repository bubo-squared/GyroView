import { describe, expect, it } from 'vitest';

import { CalibrationVersion } from './CalibrationVersion';
import { CALIBRATION_PREFERENCE, selectCalibration } from './selectCalibration';
import { CALIBRATION_SOURCES } from '../info/calibrationSources';
import { parseInfoRecord } from '../info/parseInfoRecord';
import { InfoRecordFormat } from '../constants';
import { v6CalibrationString } from '../../../../test/support/calibrationStrings';
import { OFFICE_CALIBRATION } from '../../../../test/support/officeCalibration';

/**
 * The strings of a recording that carries none.
 */
const NONE = parseInfoRecord(new Uint8Array(), InfoRecordFormat.Protobuf).calibration;

function byName(first: string, second: string): number {
  return first.localeCompare(second);
}

describe('CALIBRATION_PREFERENCE', () => {
  it('names every calibration source once', () => {
    expect(CALIBRATION_PREFERENCE.toSorted(byName)).toEqual(
      Object.keys(CALIBRATION_SOURCES).toSorted(byName),
    );
  });
});

describe('selectCalibration', () => {
  it('prefers the legacy calibration when every string exists', () => {
    const choice = selectCalibration(OFFICE_CALIBRATION);
    expect(choice.calibration?.version).toBe(CalibrationVersion.Legacy);
    expect(choice.warnings).toEqual([]);
  });

  it('falls back to the MEI calibration, then the polynomial, without the legacy string', () => {
    const mei = selectCalibration({
      ...NONE,
      offsetV2: OFFICE_CALIBRATION.offsetV2,
      offsetV3: OFFICE_CALIBRATION.offsetV3,
    });
    expect(mei.calibration?.version).toBe(CalibrationVersion.Mei);
    const polynomial = selectCalibration({ ...NONE, offsetV2: OFFICE_CALIBRATION.offsetV2 });
    expect(polynomial.calibration?.version).toBe(CalibrationVersion.Polynomial);
  });

  it('skips an unusable v3 string with a warning and uses the next one', () => {
    const choice = selectCalibration({
      ...NONE,
      offsetV2: OFFICE_CALIBRATION.offsetV2,
      offsetV3: '2_1_2_3',
    });
    expect(choice.calibration?.version).toBe(CalibrationVersion.Polynomial);
    expect(choice.warnings).toEqual([
      expect.stringMatching(/^offset_v3 skipped: .*matching no known layout/) as string,
    ]);
  });

  it('prefers the v6 string, the newer Mei fit, to v3 without the legacy string', () => {
    const choice = selectCalibration({
      ...NONE,
      offsetV3: OFFICE_CALIBRATION.offsetV3,
      offsetV6: OFFICE_CALIBRATION.offsetV6,
    });
    expect(choice.calibration?.version).toBe(CalibrationVersion.ExtendedMei);
    expect(choice.warnings).toEqual([]);
  });

  it('reads a recording that carries only the v6 string, as the X6 does', () => {
    const choice = selectCalibration({ ...NONE, offsetV6: v6CalibrationString() });
    expect(choice.calibration?.version).toBe(CalibrationVersion.ExtendedMei);
  });

  it('skips a malformed string but propagates programming errors', () => {
    const choice = selectCalibration({
      ...NONE,
      offset: 'not_a_calibration',
      offsetV3: OFFICE_CALIBRATION.offsetV3,
    });
    expect(choice.calibration?.version).toBe(CalibrationVersion.Mei);
    expect(choice.warnings[0]).toContain('offset skipped');
  });
});
