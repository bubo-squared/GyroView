import {
  BOX_HEADER_SIZE,
  BOX_SIZE_IS_LARGE,
  BOX_SIZE_OFFSET,
  BOX_TYPE_OFFSET,
  FULL_BOX_FLAG_BITS,
  FULL_BOX_HEADER_SIZE,
  FULL_BOX_VERSION_OFFSET,
  LARGE_BOX_HEADER_SIZE,
  LARGE_SIZE_OFFSET,
} from '../domain/format/boxes/boxConstants';
import { encodeAscii } from './encodeAscii';

/**
 * The version and flags a full box opens its payload with.
 */
export interface FullBoxHeader {
  readonly version: number;
  readonly flags?: number;
}

const NO_FLAGS = 0;

/**
 * One ISOBMFF box with a 32-bit size, for synthetic files in tests.
 */
export function encodeBox(type: string, payload: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(BOX_HEADER_SIZE + payload.byteLength);
  new DataView(bytes.buffer).setUint32(BOX_SIZE_OFFSET, bytes.byteLength);
  bytes.set(encodeAscii(type), BOX_TYPE_OFFSET);
  bytes.set(payload, BOX_HEADER_SIZE);
  return bytes;
}

/**
 * A full box: its version and flags, then the payload.
 */
export function encodeFullBox(
  type: string,
  header: FullBoxHeader,
  payload: Uint8Array,
): Uint8Array {
  const body = new Uint8Array(FULL_BOX_HEADER_SIZE + payload.byteLength);
  const versionAndFlags = header.version * 2 ** FULL_BOX_FLAG_BITS + (header.flags ?? NO_FLAGS);
  new DataView(body.buffer).setUint32(FULL_BOX_VERSION_OFFSET, versionAndFlags);
  body.set(payload, FULL_BOX_HEADER_SIZE);
  return encodeBox(type, body);
}

/**
 * A box with a 64-bit size, as the media data of a recording over 4 GiB has.
 */
export function encodeLargeBox(type: string, payload: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(LARGE_BOX_HEADER_SIZE + payload.byteLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(BOX_SIZE_OFFSET, BOX_SIZE_IS_LARGE);
  view.setBigUint64(LARGE_SIZE_OFFSET, BigInt(bytes.byteLength));
  bytes.set(encodeAscii(type), BOX_TYPE_OFFSET);
  bytes.set(payload, LARGE_BOX_HEADER_SIZE);
  return bytes;
}
