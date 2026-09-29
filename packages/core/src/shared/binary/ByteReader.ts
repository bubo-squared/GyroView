import { GyroViewError } from '../errors/GyroViewError';

const UINT8_SIZE = 1;
const UINT16_SIZE = 2;
const UINT32_SIZE = 4;
const UINT64_SIZE = 8;
const INT32_SIZE = 4;
const INT64_SIZE = 8;
const FLOAT64_SIZE = 8;
const IS_LITTLE_ENDIAN = true;
const IS_BIG_ENDIAN = false;

/**
 * Bounds-checked reads over a byte array: little-endian for Insta360's records, big-endian for
 * ISO BMFF boxes. Every read is positional, so callers express the layouts they parse as named
 * offsets rather than as a moving cursor.
 */
export class ByteReader {
  private readonly view: DataView;

  public constructor(private readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  public get length(): number {
    return this.bytes.byteLength;
  }

  public uint8At(offset: number): number {
    this.ensureAvailable(offset, UINT8_SIZE);
    return this.view.getUint8(offset);
  }

  public uint16LeAt(offset: number): number {
    this.ensureAvailable(offset, UINT16_SIZE);
    return this.view.getUint16(offset, IS_LITTLE_ENDIAN);
  }

  public uint16BeAt(offset: number): number {
    this.ensureAvailable(offset, UINT16_SIZE);
    return this.view.getUint16(offset, IS_BIG_ENDIAN);
  }

  public uint32LeAt(offset: number): number {
    this.ensureAvailable(offset, UINT32_SIZE);
    return this.view.getUint32(offset, IS_LITTLE_ENDIAN);
  }

  public uint32BeAt(offset: number): number {
    this.ensureAvailable(offset, UINT32_SIZE);
    return this.view.getUint32(offset, IS_BIG_ENDIAN);
  }

  /**
   * A signed big-endian 32-bit integer, as edit lists and composition offsets store them.
   */
  public int32BeAt(offset: number): number {
    this.ensureAvailable(offset, INT32_SIZE);
    return this.view.getInt32(offset, IS_BIG_ENDIAN);
  }

  /**
   * Reads an unsigned 64-bit integer as a JavaScript number; rejects values beyond 2^53 - 1.
   */
  public uint64LeAt(offset: number): number {
    this.ensureAvailable(offset, UINT64_SIZE);
    return this.toSafeNumber(this.view.getBigUint64(offset, IS_LITTLE_ENDIAN), offset);
  }

  /**
   * Reads a big-endian unsigned 64-bit integer (ISOBMFF box sizes) as a safe JavaScript number.
   */
  public uint64BeAt(offset: number): number {
    this.ensureAvailable(offset, UINT64_SIZE);
    return this.toSafeNumber(this.view.getBigUint64(offset, IS_BIG_ENDIAN), offset);
  }

  /**
   * A signed big-endian 64-bit integer (a version 1 edit list's media time) as a safe
   * JavaScript number; rejects values beyond ±(2^53 - 1).
   */
  public int64BeAt(offset: number): number {
    this.ensureAvailable(offset, INT64_SIZE);
    return this.toSafeNumber(this.view.getBigInt64(offset, IS_BIG_ENDIAN), offset);
  }

  public float64LeAt(offset: number): number {
    this.ensureAvailable(offset, FLOAT64_SIZE);
    return this.view.getFloat64(offset, IS_LITTLE_ENDIAN);
  }

  /**
   * Returns a view (not a copy) of `length` bytes starting at `offset`.
   */
  public bytesAt(offset: number, length: number): Uint8Array {
    this.ensureAvailable(offset, length);
    return this.bytes.subarray(offset, offset + length);
  }

  public asciiAt(offset: number, length: number): string {
    return Array.from(this.bytesAt(offset, length), (byte) => String.fromCodePoint(byte)).join('');
  }

  private toSafeNumber(value: bigint, offset: number): number {
    const isSafe =
      value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER);
    if (!isSafe) {
      throw new GyroViewError(
        'binary-unsafe-integer',
        `64-bit integer at offset ${offset} (${value.toString()}) exceeds the safe integer range`,
      );
    }
    return Number(value);
  }

  private ensureAvailable(offset: number, length: number): void {
    if (offset < 0 || length < 0 || offset + length > this.bytes.byteLength) {
      throw new GyroViewError(
        'binary-out-of-bounds',
        `read of ${length} byte(s) at offset ${offset} exceeds ${this.bytes.byteLength} available`,
      );
    }
  }
}
