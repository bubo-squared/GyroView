import { ensureInvariant } from '../shared/errors/GyroViewError';
import {
  FIELD_NUMBER_SHIFT,
  FIXED64_SIZE,
  VARINT_CONTINUATION_BIT,
  VARINT_PAYLOAD_MASK,
  WireType,
} from '../shared/protobuf/wireFormat';
import { encodeAscii } from './encodeAscii';

/**
 * One field of a protobuf message to encode, of the kinds the fixtures' info records need: whole
 * numbers, doubles and strings (ASCII, as every string of the info record is).
 */
export type ProtobufField =
  | { readonly number: number; readonly kind: 'varint'; readonly value: number }
  | { readonly number: number; readonly kind: 'double'; readonly value: number }
  | { readonly number: number; readonly kind: 'string'; readonly value: string };

export function varintField(number: number, value: number): ProtobufField {
  return { number, kind: 'varint', value };
}

export function doubleField(number: number, value: number): ProtobufField {
  return { number, kind: 'double', value };
}

export function stringField(number: number, value: string): ProtobufField {
  return { number, kind: 'string', value };
}

/**
 * Encodes the fields in the order given, the mirror of `ProtobufMessage.decode`: what a test
 * builds here, the parser reads back.
 */
export function encodeProtobuf(fields: readonly ProtobufField[]): Uint8Array {
  return Uint8Array.from(fields.flatMap((field) => encodeField(field)));
}

function encodeField(field: ProtobufField): number[] {
  switch (field.kind) {
    case 'varint': {
      return [...keyOf(field.number, WireType.Varint), ...encodeVarint(field.value)];
    }
    case 'double': {
      return [...keyOf(field.number, WireType.Fixed64), ...encodeDouble(field.value)];
    }
    case 'string': {
      return lengthDelimited(field.number, encodeAscii(field.value));
    }
  }
}

const IS_LITTLE_ENDIAN = true;

function encodeDouble(value: number): number[] {
  const bytes = new Uint8Array(FIXED64_SIZE);
  new DataView(bytes.buffer).setFloat64(0, value, IS_LITTLE_ENDIAN);
  return [...bytes];
}

function lengthDelimited(number: number, payload: Uint8Array): number[] {
  return [
    ...keyOf(number, WireType.LengthDelimited),
    ...encodeVarint(payload.byteLength),
    ...payload,
  ];
}

function keyOf(number: number, wireType: number): number[] {
  return encodeVarint(number * 2 ** FIELD_NUMBER_SHIFT + wireType);
}

function encodeVarint(value: number): number[] {
  ensureInvariant(
    Number.isSafeInteger(value) && value >= 0,
    `a fixture varint must be a safe non-negative integer, not ${value}`,
  );
  const bytes: number[] = [];
  let remaining = value;
  while (remaining > VARINT_PAYLOAD_MASK) {
    bytes.push((remaining % VARINT_CONTINUATION_BIT) | VARINT_CONTINUATION_BIT);
    remaining = Math.floor(remaining / VARINT_CONTINUATION_BIT);
  }
  bytes.push(remaining);
  return bytes;
}
