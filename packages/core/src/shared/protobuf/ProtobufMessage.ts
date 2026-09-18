import { ByteReader } from '../binary/ByteReader';
import { GyroViewError } from '../errors/GyroViewError';
import { decodeUtf8 } from '../text/utf8';

/**
 * Protocol Buffers wire types this decoder understands. Groups (3, 4) are obsolete and rejected.
 */
export const WireType = {
  Varint: 0,
  Fixed64: 1,
  LengthDelimited: 2,
  Fixed32: 5,
} as const;

export type ProtobufValue =
  | { readonly kind: 'varint'; readonly value: number }
  | { readonly kind: 'fixed64'; readonly bytes: Uint8Array }
  | { readonly kind: 'fixed32'; readonly bytes: Uint8Array }
  | { readonly kind: 'bytes'; readonly bytes: Uint8Array };

export interface ProtobufField {
  readonly number: number;
  readonly value: ProtobufValue;
}

const FIELD_NUMBER_SHIFT = 3;
const WIRE_TYPE_MASK = 0b111;
const VARINT_PAYLOAD_BITS = 7n;
const VARINT_PAYLOAD_MASK = 0x7fn;
const VARINT_CONTINUATION_BIT = 0x80;
const FIXED64_SIZE = 8;
const FIXED32_SIZE = 4;
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

/**
 * A schema-less view of one encoded protobuf message: fields are decoded lazily by number, and
 * unknown fields are simply ignored. Enough to read Insta360's info record without a .proto.
 */
export class ProtobufMessage {
  private constructor(private readonly decoded: readonly ProtobufField[]) {}

  public static decode(bytes: Uint8Array): ProtobufMessage {
    const cursor = new Cursor(bytes);
    const fields: ProtobufField[] = [];
    while (!cursor.atEnd) fields.push(cursor.readField());
    return new ProtobufMessage(fields);
  }

  public fields(number: number): readonly ProtobufField[] {
    return this.decoded.filter((field) => field.number === number);
  }

  public has(number: number): boolean {
    return this.decoded.some((field) => field.number === number);
  }

  public varint(number: number): number | undefined {
    const value = this.valueOf(number);
    if (value === undefined) return undefined;
    if (value.kind !== 'varint') throw this.wrongType(number, 'varint', value.kind);
    return value.value;
  }

  public boolean(number: number): boolean | undefined {
    const value = this.varint(number);
    return value === undefined ? undefined : value !== 0;
  }

  public double(number: number): number | undefined {
    const value = this.valueOf(number);
    if (value === undefined) return undefined;
    if (value.kind !== 'fixed64') throw this.wrongType(number, 'fixed64', value.kind);
    return new ByteReader(value.bytes).float64LeAt(0);
  }

  public bytes(number: number): Uint8Array | undefined {
    const value = this.valueOf(number);
    if (value === undefined) return undefined;
    if (value.kind !== 'bytes') throw this.wrongType(number, 'bytes', value.kind);
    return value.bytes;
  }

  public string(number: number): string | undefined {
    const bytes = this.bytes(number);
    return bytes === undefined ? undefined : decodeUtf8(bytes);
  }

  public message(number: number): ProtobufMessage | undefined {
    const bytes = this.bytes(number);
    return bytes === undefined ? undefined : ProtobufMessage.decode(bytes);
  }

  /**
   * Scalar accessors follow protobuf merge semantics: the last occurrence of a field wins.
   */
  private valueOf(number: number): ProtobufValue | undefined {
    return this.decoded.findLast((field) => field.number === number)?.value;
  }

  private wrongType(number: number, expected: string, actual: string): GyroViewError {
    return new GyroViewError(
      'invalid-protobuf',
      `field ${number} is encoded as ${actual}, expected ${expected}`,
    );
  }
}

/**
 * Sequential reader over the wire format; kept private to the message decoder.
 */
class Cursor {
  private position = 0;
  private readonly reader: ByteReader;

  public constructor(private readonly bytes: Uint8Array) {
    this.reader = new ByteReader(bytes);
  }

  public get atEnd(): boolean {
    return this.position >= this.bytes.byteLength;
  }

  public readField(): ProtobufField {
    const key = this.readVarint();
    const number = Math.floor(key / 2 ** FIELD_NUMBER_SHIFT);
    const wireType = key & WIRE_TYPE_MASK;
    return { number, value: this.readValue(wireType, number) };
  }

  private readValue(wireType: number, fieldNumber: number): ProtobufValue {
    switch (wireType) {
      case WireType.Varint: {
        return { kind: 'varint', value: this.readVarint() };
      }
      case WireType.Fixed64: {
        return { kind: 'fixed64', bytes: this.readBytes(FIXED64_SIZE) };
      }
      case WireType.Fixed32: {
        return { kind: 'fixed32', bytes: this.readBytes(FIXED32_SIZE) };
      }
      case WireType.LengthDelimited: {
        return { kind: 'bytes', bytes: this.readBytes(this.readVarint()) };
      }
      default: {
        throw new GyroViewError(
          'invalid-protobuf',
          `field ${fieldNumber} uses unsupported wire type ${wireType}`,
        );
      }
    }
  }

  private readVarint(): number {
    let result = 0n;
    let shift = 0n;
    for (;;) {
      const byte = this.readByte();
      result |= (BigInt(byte) & VARINT_PAYLOAD_MASK) << shift;
      if ((byte & VARINT_CONTINUATION_BIT) === 0) break;
      shift += VARINT_PAYLOAD_BITS;
    }
    if (result > MAX_SAFE) {
      throw new GyroViewError(
        'binary-unsafe-integer',
        `varint ${result.toString()} exceeds the safe integer range`,
      );
    }
    return Number(result);
  }

  private readByte(): number {
    this.ensureRemaining(1);
    const byte = this.reader.uint8At(this.position);
    this.position += 1;
    return byte;
  }

  private readBytes(length: number): Uint8Array {
    this.ensureRemaining(length);
    const bytes = this.reader.bytesAt(this.position, length);
    this.position += length;
    return bytes;
  }

  private ensureRemaining(length: number): void {
    if (this.position + length > this.bytes.byteLength) {
      throw new GyroViewError('invalid-protobuf', `message truncated at byte ${this.position}`);
    }
  }
}
