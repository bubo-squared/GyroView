import { GyroViewError, type ByteRange } from '@gyroview/core';

import { passing } from './passingFailures';

/**
 * A body a dropped connection broke off after the headers: the most common way a network fails
 * during long playback, so it is `source-unreadable` as a refused request is, not a bug or a bad
 * file, and worth another try.
 */
export function brokenOff(url: string, range: ByteRange, cause: unknown): GyroViewError {
  return passing(
    new GyroViewError(
      'source-unreadable',
      `${url} broke off the ${range.length}-byte range at ${range.offset}`,
      { cause },
    ),
  );
}

export function truncated(url: string, received: number, range: ByteRange): GyroViewError {
  return new GyroViewError(
    'source-truncated',
    `${url} returned ${received} bytes for a ${range.length}-byte range at ${range.offset}`,
  );
}
