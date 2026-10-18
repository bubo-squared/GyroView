import { encodeAscii } from '../../src/testing/encodeAscii';

const TRIM_RECORD_SIZE = 28;

/**
 * A trim record as the Insta360 app writes it: the magic, two u16 fields seen as 1 on every file
 * at hand, the frame the trimmed clip starts at, and zeros up to 28 bytes.
 */
export function trimRecord(startFrame: number, magic = 'TEO1'): Uint8Array {
  const payload = new Uint8Array(TRIM_RECORD_SIZE);
  payload.set(encodeAscii(magic), 0);
  const fields = new DataView(payload.buffer);
  fields.setUint16(4, 1, true);
  fields.setUint16(6, 1, true);
  fields.setUint32(8, startFrame, true);
  return payload;
}
