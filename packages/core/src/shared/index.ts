// The shared vocabulary of the core's public API: errors, units, rotations and small helpers,
// re-exported whole by the package index.
export {
  asGyroViewError,
  ensureIndexInRange,
  ensureInvariant,
  GYRO_VIEW_ERROR_CATEGORIES,
  GYRO_VIEW_ERROR_CODES,
  GyroViewError,
  hasErrorCode,
  isAbortError,
  isGyroViewErrorCode,
  messageOf,
  type GyroViewErrorCategory,
  type GyroViewErrorCode,
} from './errors/GyroViewError';
export { keysOf } from './keysOf';
export { mapRecord } from './mapRecord';
export { lazy } from './lazy';
export { Outbox, type EventSink } from './events/Outbox';
export { clamp } from './math/clamp';
export { indexOfLeast, parabolicOffset } from './math/minimum';
export { magnitudeOf, type Vector3 } from './math/Vector3';
export {
  IDENTITY_MATRIX3,
  multiplyMatrices,
  rotationAboutX,
  rotationAboutY,
  rotationAboutZ,
  transformVector,
  transposeMatrix,
  type Matrix3,
} from './math/Matrix3';
export {
  conjugateQuaternion,
  quaternionFromAxisAngle,
  rotateVector,
  type Quaternion,
} from './math/Quaternion';
export type { ReadonlyFloat64Array } from './binary/ReadonlyTypedArray';
export {
  microseconds,
  microsecondsToSeconds,
  milliseconds,
  seconds,
  secondsToMicroseconds,
  secondsToMilliseconds,
  type Microseconds,
  type Milliseconds,
  type Seconds,
} from './units/time';
export {
  degrees,
  degreesToRadians,
  FULL_TURN,
  HALF_TURN,
  QUARTER_TURN,
  radians,
  radiansToDegrees,
  type Degrees,
  type Radians,
} from './units/angle';
