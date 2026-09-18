/**
 * Byte layouts of gyro record (id 3) samples. Sources: X5 recordings (raw layout, verified
 * against exiftool's decoded values) and telemetry-parser `src/insta360/record.rs` (float layout).
 */

/**
 * Raw layout (`is_raw_gyro` = 1): u64 LE timestamp in microseconds, then accelerometer x y z and
 * gyroscope x y z as u16 LE offset-binary values centred on 32768, scaled by the sensor ranges.
 */
export const RAW_SAMPLE_SIZE = 20;
export const RAW_TIMESTAMP_OFFSET = 0;
export const RAW_ACCELERATION_OFFSET = 8;
export const RAW_ANGULAR_VELOCITY_OFFSET = 14;
export const RAW_COMPONENT_SIZE = 2;
export const RAW_ZERO_POINT = 32_768;
export const RAW_FULL_SCALE = 32_768;

/**
 * Float layout: u64 LE timestamp in milliseconds, then accelerometer x y z in g and gyroscope
 * x y z in radians per second, each a little-endian float64.
 */
export const FLOAT_SAMPLE_SIZE = 56;
export const FLOAT_TIMESTAMP_OFFSET = 0;
export const FLOAT_ACCELERATION_OFFSET = 8;
export const FLOAT_ANGULAR_VELOCITY_OFFSET = 32;
export const FLOAT_COMPONENT_SIZE = 8;

/**
 * Sensor ranges assumed when the info record does not state them (telemetry-parser defaults).
 */
export const DEFAULT_ACCELEROMETER_RANGE_G = 16;
export const DEFAULT_GYROSCOPE_RANGE_DPS = 2000;
