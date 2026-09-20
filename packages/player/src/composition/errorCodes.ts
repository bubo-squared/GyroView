import { GyroViewError, type GyroViewErrorCode } from '@gyroview/core';

export function hasErrorCode(error: unknown, code: GyroViewErrorCode): boolean {
  return error instanceof GyroViewError && error.code === code;
}

/**
 * A load that was cancelled by a newer load or by unloading; not a failure to report.
 */
export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
