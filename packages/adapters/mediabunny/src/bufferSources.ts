/**
 * A copy of a buffer source as a plain Uint8Array. Decoder descriptions are small; the copy keeps
 * them independent of mediabunny's own buffers and never on shared memory. SharedArrayBuffer is
 * not named, since browsers define it only under cross-origin isolation.
 */
export function copyOfBytes(source: AllowSharedBufferSource): Uint8Array {
  const view = ArrayBuffer.isView(source)
    ? new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
    : new Uint8Array(source);
  return Uint8Array.from(view);
}
