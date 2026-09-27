/**
 * Stable machine-readable failure categories. Embedders switch on these; messages are for humans.
 */
export const GYRO_VIEW_ERROR_CODES = [
  'binary-out-of-bounds',
  'binary-unsafe-integer',
  'codec-unsupported',
  'cors',
  'decode',
  'embed-destroyed',
  'index-out-of-range',
  'invalid-argument',
  'invalid-byte-range',
  'invalid-calibration',
  'invalid-protobuf',
  'invalid-trailer',
  'invariant-violation',
  'missing-second-file',
  'no-calibration',
  'no-info-record',
  'no-key-frame',
  'playback-blocked',
  'range-unsupported',
  'render-unavailable',
  'source-truncated',
  'source-unreadable',
  'unsupported-calibration',
  'unsupported-container',
  'unsupported-gyro-record',
  'unsupported-info-format',
  'unsupported-layout',
] as const;

export type GyroViewErrorCode = (typeof GYRO_VIEW_ERROR_CODES)[number];

export function isGyroViewErrorCode(value: unknown): value is GyroViewErrorCode {
  return typeof value === 'string' && (GYRO_VIEW_ERROR_CODES as readonly string[]).includes(value);
}

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

export function hasErrorCode(error: unknown, code: GyroViewErrorCode): boolean {
  return error instanceof GyroViewError && error.code === code;
}

/**
 * The human-readable part of anything thrown: an error's message, or the value as text.
 */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
