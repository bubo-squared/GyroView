import type { CalibrationSet } from '../../optics/LensCalibration';

/**
 * Which calibration string a set was read from, in increasing order of fidelity: `offset` (1),
 * `offset_v2` (2) and `offset_v3` (3). The versioned strings declare theirs in the high bits of
 * their version word (the X5 recordings; insta360-rs docs); the legacy one declares none.
 */
export const CalibrationVersion = { Legacy: 1, Polynomial: 2, Mei: 3 } as const;

export type CalibrationVersion = (typeof CalibrationVersion)[keyof typeof CalibrationVersion];

/**
 * A calibration as read from its string: the optics set, and which version of the string it
 * came from.
 */
export interface VersionedCalibration extends CalibrationSet {
  readonly version: CalibrationVersion;
}
