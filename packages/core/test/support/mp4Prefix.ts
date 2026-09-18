/**
 * The smallest sequence of bytes the box scanner accepts as an MP4 body: an `ftyp` and an empty
 * `moov`. Stands in for the media data in trailer tests.
 */
export function minimalMp4Prefix(): Uint8Array {
  return new Uint8Array([
    ...boxOf('ftyp', new TextEncoder().encode('isom')),
    ...boxOf('moov', new Uint8Array()),
  ]);
}

function boxOf(type: string, payload: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(8 + payload.byteLength);
  new DataView(bytes.buffer).setUint32(0, bytes.byteLength);
  bytes.set(new TextEncoder().encode(type), 4);
  bytes.set(payload, 8);
  return bytes;
}
