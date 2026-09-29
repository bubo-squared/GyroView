import {
  BOX_HEADER_SIZE,
  FULL_BOX_HEADER_SIZE,
  FULL_BOX_VERSION_OFFSET,
  LARGE_BOX_HEADER_SIZE,
} from '../boxes/boxConstants';
import { boxHeaderOf } from '../boxes/boxHeader';
import { ByteReader } from '../../../shared/binary/ByteReader';
import { GyroViewError } from '../../../shared/errors/GyroViewError';

/**
 * A box inside the movie box, held in memory: its type and the bytes after its header.
 */
export interface Mp4Box {
  readonly type: string;
  readonly body: Uint8Array;
}

/**
 * A full box's version, and its content after the version and flags.
 */
export interface FullBox {
  readonly version: number;
  readonly content: ByteReader;
}

/**
 * The boxes `bytes` holds one after another: the children of a container box. Fewer bytes than
 * a header at the end are padding, which some muxers leave; any other bytes that form no box are
 * a movie box the player cannot read.
 */
export function boxesIn(bytes: Uint8Array): Mp4Box[] {
  const boxes: Mp4Box[] = [];
  let offset = 0;
  while (bytes.byteLength - offset >= BOX_HEADER_SIZE) {
    const room = bytes.byteLength - offset;
    const headerBytes = bytes.subarray(offset, offset + Math.min(room, LARGE_BOX_HEADER_SIZE));
    const header = boxHeaderOf(new ByteReader(headerBytes), room);
    if (!header) throw unreadableMovie(`holds no box at byte ${offset} of ${bytes.byteLength}`);
    const body = bytes.subarray(offset + header.headerSize, offset + header.size);
    boxes.push({ type: header.type, body });
    offset += header.size;
  }
  return boxes;
}

/**
 * The first box of a type the movie box cannot do without.
 */
export function requiredBox(boxes: readonly Mp4Box[], type: string): Mp4Box {
  const box = optionalBox(boxes, type);
  if (!box) throw unreadableMovie(`has no ${type} box where one belongs`);
  return box;
}

export function optionalBox(boxes: readonly Mp4Box[], type: string): Mp4Box | undefined {
  return boxes.find((box) => box.type === type);
}

export function fullBoxOf(box: Mp4Box): FullBox {
  if (box.body.byteLength < FULL_BOX_HEADER_SIZE) {
    throw unreadableMovie(`has a ${box.type} box too short for its version and flags`);
  }
  return {
    version: box.body[FULL_BOX_VERSION_OFFSET] ?? 0,
    content: new ByteReader(box.body.subarray(FULL_BOX_HEADER_SIZE)),
  };
}

/**
 * A movie box whose bytes do not describe the samples as ISO/IEC 14496-12 lays them out.
 */
export function unreadableMovie(what: string): GyroViewError {
  return new GyroViewError('unsupported-container', `the movie box ${what}`);
}
