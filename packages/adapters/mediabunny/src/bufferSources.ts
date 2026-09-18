/**
 * Copies a buffer source into a plain Uint8Array without naming SharedArrayBuffer, which
 * browsers only define under cross-origin isolation.
 */
export function toBytes(source: AllowSharedBufferSource): Uint8Array {
  return ArrayBuffer.isView(source)
    ? new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
    : new Uint8Array(source);
}
