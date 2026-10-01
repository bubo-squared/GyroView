import { seconds, type OrientationTrack, type Quaternion, type Vector3 } from '@gyroview/core';

/**
 * The span over which a turn rate is read from the orientations.
 */
const RATE_SPAN_SECONDS = 0.01;

/**
 * The camera's angular velocity at `time`, in the world frame and radians a second: the
 * rotation between its orientations a short span apart, as an axis times its angle.
 */
export function angularVelocityAt(orientations: OrientationTrack, time: number): Vector3 {
  const before = orientations.orientationAt(seconds(time));
  const after = orientations.orientationAt(seconds(time + RATE_SPAN_SECONDS));
  const [x, y, z, w] = productWithInverse(after, before);
  const sine = Math.hypot(x, y, z);
  if (sine === 0) return [0, 0, 0];
  const angle = 2 * Math.atan2(sine, Math.abs(w));
  const scale = (Math.sign(w) || 1) * (angle / sine / RATE_SPAN_SECONDS);
  return [x * scale, y * scale, z * scale];
}

/**
 * `left` times the inverse of the unit quaternion `right`: the rotation from `right` to `left`.
 */
function productWithInverse(left: Quaternion, right: Quaternion): Quaternion {
  const [lx, ly, lz, lw] = left;
  const [qx, qy, qz, qw] = right;
  return [
    -lw * qx + lx * qw - ly * qz + lz * qy,
    -lw * qy + lx * qz + ly * qw - lz * qx,
    -lw * qz - lx * qy + ly * qx + lz * qw,
    lw * qw + lx * qx + ly * qy + lz * qz,
  ];
}
