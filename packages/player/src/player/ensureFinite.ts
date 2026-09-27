import { GyroViewError } from '@gyroview/core';

/**
 * A number from the page: NaN from an empty field or an undefined value would reach the clock
 * and the view, which cannot take it.
 */
export function ensureFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new GyroViewError('invalid-argument', `${name} must be a finite number`);
  }
}
