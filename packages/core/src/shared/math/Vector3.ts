/**
 * Three components in the order x, y, z. Immutable by convention; the typed-array tracks in the
 * motion domain store the same layout contiguously.
 */
export type Vector3 = readonly [x: number, y: number, z: number];

export const VECTOR3_COMPONENTS = 3;

export const ZERO_VECTOR3: Vector3 = [0, 0, 0];

export function magnitudeOf(vector: Vector3): number {
  return Math.hypot(vector[0], vector[1], vector[2]);
}

export function dotProduct(a: Vector3, b: Vector3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * Right-handed: x cross y is z.
 */
export function crossProduct(a: Vector3, b: Vector3): Vector3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function isFiniteVector(vector: Vector3): boolean {
  return vector.every((component) => Number.isFinite(component));
}

export function addVectors(a: Vector3, b: Vector3): Vector3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function subtractVectors(a: Vector3, b: Vector3): Vector3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scaleVector(vector: Vector3, factor: number): Vector3 {
  return [vector[0] * factor, vector[1] * factor, vector[2] * factor];
}

/**
 * The point `weight` of the way from `from` to `to`: `from` at 0, `to` at 1.
 */
export function interpolateVectors(from: Vector3, to: Vector3, weight: number): Vector3 {
  return addVectors(from, scaleVector(subtractVectors(to, from), weight));
}
