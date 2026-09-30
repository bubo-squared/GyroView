import { ByteReader } from '../binary/ByteReader';
import { GyroViewError } from '../errors/GyroViewError';
import { decodeUtf8 } from '../text/utf8';
import {
  FIELD_NUMBER_SHIFT,
  FIXED32_SIZE,
  FIXED64_SIZE,
  MAX_VARINT_BYTES,
  VARINT_CONTINUATION_BIT,
  VARINT_PAYLOAD_BITS,
  VARINT_PAYLOAD_MASK,
  WIRE_TYPE_MASK,
  WireType,
} from './wireFormat';

type ProtobufValue =
  | { readonly kind: 'varint'; readonly value: bigint }
  | { readonly kind: 'fixed64'; readonly bytes: Uint8Array }
  | { readonly kind: 'fixed32'; readonly bytes: Uint8Array }
  | { readonly kind: 'bytes'; readonly bytes: Uint8Array };

interface ProtobufField {
  readonly number: number;
  readonly value: ProtobufValue;
}

const VARINT_SHIFT = BigInt(VARINT_PAYLOAD_BITS);
const VARINT_MASK = BigInt(VARINT_PAYLOAD_MASK);
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

/**
 * A schema-less view of one encoded protobuf message: fields are looked up by number and unknown
 * fields are simply carried along. Varints stay exact (bigint) until a caller asks for a number,
 * so an oversized value in a field nobody reads cannot break the whole record.
 */
export class ProtobufMessage {
  private constructor(private readonly decoded: readonly ProtobufField[]) {}

  public static decode(bytes: Uint8Array): ProtobufMessage {
    const cursor = new Cursor(bytes);
    const fields: ProtobufField[] = [];
    while (!cursor.atEnd) fields.push(cursor.readField());
    return new ProtobufMessage(fields);
  }

  public varint(number: number): number | undefined {
    const value = this.valueOf(number);
    if (value === undefined) return undefined;
    if (value.kind !== 'varint') throw this.wrongType(number, 'varint', value.kind);
    if (value.value > MAX_SAFE) {
      throw new GyroViewError(
        'binary-unsafe-integer',
        `field ${number} holds ${value.value.toString()}, beyond the safe integer range`,
      );
    }
    return Number(value.value);
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
    const number = Number(key >> BigInt(FIELD_NUMBER_SHIFT));
    const wireType = Number(key & BigInt(WIRE_TYPE_MASK));
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
        return { kind: 'bytes', bytes: this.readBytes(this.readLength()) };
      }
      default: {
        throw new GyroViewError(
          'invalid-protobuf',
          `field ${fieldNumber} uses unsupported wire type ${wireType}`,
        );
      }
    }
  }

  private readVarint(): bigint {
    let result = 0n;
    let shift = 0n;
    for (let consumed = 0; consumed < MAX_VARINT_BYTES; consumed += 1) {
      const byte = this.readByte();
      result |= (BigInt(byte) & VARINT_MASK) << shift;
      if ((byte & VARINT_CONTINUATION_BIT) === 0) return result;
      shift += VARINT_SHIFT;
    }
    throw new GyroViewError(
      'invalid-protobuf',
      `varint longer than ${MAX_VARINT_BYTES} bytes at byte ${this.position}`,
    );
  }

  private readLength(): number {
    const length = this.readVarint();
    if (length > BigInt(this.bytes.byteLength)) {
      throw new GyroViewError(
        'invalid-protobuf',
        `length ${length.toString()} exceeds the message at byte ${this.position}`,
      );
    }
    return Number(length);
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
