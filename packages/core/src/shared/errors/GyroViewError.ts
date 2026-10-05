/**
 * Stable machine-readable failure codes. Embedders switch on these; messages are for humans.
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
  'no-source',
  'play-interrupted',
  'playback-blocked',
  'range-unsupported',
  'render-unavailable',
  'source-changed',
  'source-truncated',
  'source-unreadable',
  'unsupported-calibration',
  'unsupported-container',
  'unsupported-gyro-record',
  'unsupported-info-format',
  'unsupported-layout',
  'webcodecs-unavailable',
] as const;

export type GyroViewErrorCode = (typeof GYRO_VIEW_ERROR_CODES)[number];

/**
 * Whose side a failure is on, for embedders that handle failures by kind: the browser cannot
 * decode or draw the recording, the file is not one the player can play, its bytes could not be
 * read, the page misused the API, or the player failed in a way it did not expect.
 */
export const GYRO_VIEW_ERROR_CATEGORIES = [
  'browser',
  'recording',
  'source',
  'usage',
  'internal',
] as const;

export type GyroViewErrorCategory = (typeof GYRO_VIEW_ERROR_CATEGORIES)[number];

/**
 * A record, so a new code cannot be added without its category.
 */
const CATEGORY_OF_CODE: Readonly<Record<GyroViewErrorCode, GyroViewErrorCategory>> = {
  'binary-out-of-bounds': 'recording',
  'binary-unsafe-integer': 'recording',
  'codec-unsupported': 'browser',
  cors: 'source',
  decode: 'browser',
  'embed-destroyed': 'usage',
  'index-out-of-range': 'internal',
  'invalid-argument': 'usage',
  'invalid-byte-range': 'recording',
  'invalid-calibration': 'recording',
  'invalid-protobuf': 'recording',
  'invalid-trailer': 'recording',
  'invariant-violation': 'internal',
  'missing-second-file': 'recording',
  'no-calibration': 'recording',
  'no-info-record': 'recording',
  'no-key-frame': 'recording',
  'no-source': 'usage',
  'play-interrupted': 'usage',
  'playback-blocked': 'browser',
  'range-unsupported': 'source',
  'render-unavailable': 'browser',
  'source-changed': 'source',
  'source-truncated': 'source',
  'source-unreadable': 'source',
  'unsupported-calibration': 'recording',
  'unsupported-container': 'recording',
  'unsupported-gyro-record': 'recording',
  'unsupported-info-format': 'recording',
  'unsupported-layout': 'recording',
  'webcodecs-unavailable': 'browser',
};

export function isGyroViewErrorCode(value: unknown): value is GyroViewErrorCode {
  return typeof value === 'string' && (GYRO_VIEW_ERROR_CODES as readonly string[]).includes(value);
}

export class GyroViewError extends Error {
  /**
   * Its own property rather than a getter, so a serialized or logged copy of the error keeps it.
   */
  public readonly category: GyroViewErrorCategory;

  public constructor(
    public readonly code: GyroViewErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'GyroViewError';
    this.category = CATEGORY_OF_CODE[code];
  }
}

/**
 * `error` as a `GyroViewError`: one already typed as it is, anything else under `code`, kept as
 * the cause, so a failure crosses a boundary typed without losing what it was.
 */
export function asGyroViewError(
  error: unknown,
  code: GyroViewErrorCode,
  message: string,
): GyroViewError {
  return error instanceof GyroViewError
    ? error
    : new GyroViewError(code, message, { cause: error });
}

/**
 * A caller's abort, as `AbortSignal` reports it (a `DOMException` named `AbortError`): passed on
 * as it is, never taken for a failure.
 */
export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
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
