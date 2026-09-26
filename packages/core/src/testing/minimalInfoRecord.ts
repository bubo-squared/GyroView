import { InfoField } from '../domain/format/info/infoFields';
import { encodeAscii } from '../shared/text/ascii';

/**
 * Protobuf wire types and the bits of a field key that hold them (protobuf encoding spec).
 */
const WIRE_VARINT = 0;
const WIRE_LENGTH_DELIMITED = 2;
const WIRE_TYPE_BITS = 3;
const VARINT_CONTINUE = 0x80;
const VARINT_MASK = 0x7f;

export interface MinimalInfo {
  readonly model: string;
  readonly frameRate?: number;
  readonly firstFrameTimestamp?: number;
  readonly ptsType?: number;
}

/**
 * A hand-encoded info record with just the fields named: enough to read a recording of a camera
 * without calibration or timing, which no committed fixture represents.
 */
export function minimalInfoRecord(info: MinimalInfo): Uint8Array {
  const model = encodeAscii(info.model);
  return Uint8Array.from([
    ...tagOf(InfoField.Model, WIRE_LENGTH_DELIMITED),
    ...encodeVarint(model.byteLength),
    ...model,
    ...varintField(InfoField.FrameRate, info.frameRate),
    ...varintField(InfoField.FirstFrameTimestamp, info.firstFrameTimestamp),
    ...varintField(InfoField.PtsType, info.ptsType),
  ]);
}

function encodeVarint(value: number): number[] {
  const bytes: number[] = [];
  let remaining = value;
  while (remaining >= VARINT_CONTINUE) {
    bytes.push((remaining & VARINT_MASK) | VARINT_CONTINUE);
    remaining = Math.floor(remaining / VARINT_CONTINUE);
  }
  bytes.push(remaining);
  return bytes;
}

function tagOf(field: number, wireType: number): number[] {
  return encodeVarint((field << WIRE_TYPE_BITS) | wireType);
}

function varintField(field: number, value: number | undefined): number[] {
  return value === undefined ? [] : [...tagOf(field, WIRE_VARINT), ...encodeVarint(value)];
}
