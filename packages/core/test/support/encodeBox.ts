import { BOX_HEADER_SIZE, BOX_TYPE_OFFSET } from '../../src/domain/format/boxes/boxConstants';

/**
 * One ISOBMFF box with a 32-bit size, for synthetic files in tests.
 */
export function encodeBox(type: string, payload: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(BOX_HEADER_SIZE + payload.byteLength);
  new DataView(bytes.buffer).setUint32(0, bytes.byteLength);
  bytes.set(new TextEncoder().encode(type), BOX_TYPE_OFFSET);
  bytes.set(payload, BOX_HEADER_SIZE);
  return bytes;
}
