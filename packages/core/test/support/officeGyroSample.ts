/**
 * The first gyro sample of the office X5 recording (fixture record-03-gyro-first2000.bin) as raw
 * offset-binary words, from `exiftool -ee -v3` on 2026-09-18: capture time 921648752 us,
 * accelerometer (-0.619, -0.014, -0.813) and angular velocity (0.081, -0.071, -0.175) under
 * exiftool's approximate /1000 scaling.
 */
export const OFFICE_FIRST_GYRO_SAMPLE = {
  captureTimeUs: 921_648_752,
  rawAcceleration: [32_149, 32_754, 31_955] as const,
  rawAngularVelocity: [32_849, 32_697, 32_593] as const,
  ranges: { accelerometerG: 32, gyroscopeDps: 2000 },
} as const;

export const RAW_ZERO_POINT = 32_768;
export const RAW_FULL_SCALE = 32_768;
