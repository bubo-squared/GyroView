import {
  FOOTER_MAGIC_OFFSET,
  FOOTER_MAGIC_SIZE,
  FOOTER_TRAILER_SIZE_OFFSET,
  FOOTER_VERSION_OFFSET,
  TRAILER_FOOTER_SIZE,
  TRAILER_MAGIC,
} from '../constants';
import { ByteReader } from '../../../shared/binary/ByteReader';
import { GyroViewError } from '../../../shared/errors/GyroViewError';

/**
 * The fixed 72-byte block that closes an Insta360 file. Its presence identifies the format;
 * its size field tells where the trailer payload begins.
 */
export class TrailerFooter {
  private constructor(
    public readonly trailerSize: number,
    public readonly version: number,
  ) {}

  /**
   * Parses exactly the last {@link TRAILER_FOOTER_SIZE} bytes of a file.
   */
  public static parse(bytes: Uint8Array): TrailerFooter {
    if (bytes.byteLength !== TRAILER_FOOTER_SIZE) {
      throw new GyroViewError(
        'invalid-trailer',
        `footer must be ${TRAILER_FOOTER_SIZE} bytes, got ${bytes.byteLength}`,
      );
    }
    const reader = new ByteReader(bytes);
    const magic = reader.asciiAt(FOOTER_MAGIC_OFFSET, FOOTER_MAGIC_SIZE);
    if (magic !== TRAILER_MAGIC) {
      throw new GyroViewError('invalid-trailer', 'file does not end with the Insta360 magic');
    }
    return new TrailerFooter(
      reader.uint32LeAt(FOOTER_TRAILER_SIZE_OFFSET),
      reader.uint32LeAt(FOOTER_VERSION_OFFSET),
    );
  }

  /**
   * Whether the last bytes of a file look like an Insta360 footer, without throwing.
   */
  public static isPresentIn(bytes: Uint8Array): boolean {
    if (bytes.byteLength < TRAILER_FOOTER_SIZE) return false;
    const tail = bytes.subarray(bytes.byteLength - TRAILER_FOOTER_SIZE);
    return new ByteReader(tail).asciiAt(FOOTER_MAGIC_OFFSET, FOOTER_MAGIC_SIZE) === TRAILER_MAGIC;
  }
}
