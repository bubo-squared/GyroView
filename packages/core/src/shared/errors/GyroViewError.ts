/**
 * Stable machine-readable failure categories. Embedders switch on these; messages are for humans.
 */
export type GyroViewErrorCode =
  | 'binary-out-of-bounds'
  | 'binary-unsafe-integer'
  | 'invalid-byte-range'
  | 'invalid-calibration'
  | 'invalid-exposure-record'
  | 'invalid-gyro-record'
  | 'invalid-protobuf'
  | 'invalid-trailer'
  | 'missing-second-file'
  | 'no-calibration'
  | 'no-info-record'
  | 'record-not-found'
  | 'unsupported-calibration'
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
