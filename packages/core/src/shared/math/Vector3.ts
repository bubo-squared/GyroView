/**
 * Three components in the order x, y, z. Immutable by convention; the typed-array tracks in the
 * motion domain store the same layout contiguously.
 */
export type Vector3 = readonly [x: number, y: number, z: number];

export const VECTOR3_COMPONENTS = 3;

export function magnitudeOf(vector: Vector3): number {
  return Math.hypot(vector[0], vector[1], vector[2]);
}
