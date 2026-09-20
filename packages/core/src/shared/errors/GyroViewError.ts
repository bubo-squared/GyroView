/**
 * Stable machine-readable failure categories. Embedders switch on these; messages are for humans.
 */
export type GyroViewErrorCode =
  | 'binary-out-of-bounds'
  | 'binary-unsafe-integer'
  | 'codec-unsupported'
  | 'decode'
  | 'index-out-of-range'
  | 'invalid-byte-range'
  | 'invalid-calibration'
  | 'invalid-protobuf'
  | 'invalid-trailer'
  | 'invariant-violation'
  | 'missing-second-file'
  | 'no-calibration'
  | 'no-frame-times'
  | 'no-info-record'
  | 'playback-blocked'
  | 'range-unsupported'
  | 'record-not-found'
  | 'render-unavailable'
  | 'source-truncated'
  | 'source-unreadable'
  | 'unsupported-calibration'
  | 'unsupported-gyro-record'
  | 'unsupported-info-format'
  | 'unsupported-layout';

export class GyroViewError extends Error {
  public constructor(
    public readonly code: GyroViewErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'GyroViewError';
  }
}

/**
 * Guards a constructor or factory precondition with the shared error type.
 */
export function ensureInvariant(isSatisfied: boolean, message: string): asserts isSatisfied {
  if (!isSatisfied) throw new GyroViewError('invariant-violation', message);
}

/**
 * Guards positional access into a fixed-length collection.
 */
export function ensureIndexInRange(index: number, length: number, subject: string): void {
  if (!Number.isSafeInteger(index) || index < 0 || index >= length) {
    throw new GyroViewError(
      'index-out-of-range',
      `${subject} index ${index} is outside 0..${length - 1}`,
    );
  }
}
