/**
 * Stable machine-readable failure categories. Embedders switch on these; messages are for humans.
 */
export type GyroViewErrorCode =
  | 'binary-out-of-bounds'
  | 'binary-unsafe-integer'
  | 'invalid-byte-range'
  | 'invalid-protobuf'
  | 'invalid-trailer'
  | 'record-not-found';

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
