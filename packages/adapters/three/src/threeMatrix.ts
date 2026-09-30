import type { Matrix3 as CoreMatrix3 } from '@gyroview/core';
import { Matrix3 } from 'three';

/**
 * Row-major core matrix into a three matrix, whose `set` takes rows too.
 */
export function toThreeMatrix(m: CoreMatrix3): Matrix3 {
  return new Matrix3().set(...m);
}
