/**
 * Byte-level constants of the Insta360 trailer. Sources: the two X5 recordings inspected on
 * 2026-09-18 (test/fixtures/x5/manifest.json), Gyroflow's telemetry-parser (src/insta360/mod.rs)
 * and ExifTool (QuickTimeStream.pl, ProcessInsta360). Every number here was confirmed against
 * the fixtures unless marked otherwise.
 */

/**
 * ASCII string that ends every Insta360 file carrying a trailer.
 */
export const TRAILER_MAGIC = '8db42d694ccc418790edff439fe026bf';

/**
 * Footer layout, from the end of the file backwards:
 * 32 reserved bytes, u32 LE trailer size, u32 LE version, 32-byte magic.
 */
export const TRAILER_FOOTER_SIZE = 72;
const FOOTER_RESERVED_SIZE = 32;
const FOOTER_FIELD_SIZE = 4;
export const FOOTER_TRAILER_SIZE_OFFSET = FOOTER_RESERVED_SIZE;
export const FOOTER_VERSION_OFFSET = FOOTER_TRAILER_SIZE_OFFSET + FOOTER_FIELD_SIZE;
export const FOOTER_MAGIC_OFFSET = FOOTER_VERSION_OFFSET + FOOTER_FIELD_SIZE;
export const FOOTER_MAGIC_SIZE = 32;

/**
 * Every record payload is followed by a 6-byte header: u8 format, u8 id, u32 LE payload size.
 */
export const RECORD_HEADER_SIZE = 6;
export const RECORD_HEADER_FORMAT_OFFSET = 0;
export const RECORD_HEADER_ID_OFFSET = 1;
export const RECORD_HEADER_SIZE_OFFSET = 2;

/**
 * The index record (id 0) holds fixed slots of u8 id, u8 format, u32 LE size, u32 LE offset
 * relative to the trailer payload start. Slot k describes record type k; empty slots are zero.
 */
export const INDEX_SLOT_SIZE = 10;
export const INDEX_SLOT_ID_OFFSET = 0;
export const INDEX_SLOT_FORMAT_OFFSET = 1;
export const INDEX_SLOT_SIZE_OFFSET = 2;
export const INDEX_SLOT_OFFSET_OFFSET = 6;

/**
 * Record type ids observed in X5 files and documented by telemetry-parser for older cameras.
 */
export const RecordType = {
  Index: 0,
  Info: 1,
  Thumbnail: 2,
  Gyro: 3,
  Exposure: 4,
  ThumbnailExtended: 5,
  FrameTimestamps: 6,
  Gps: 7,
} as const;

export type RecordType = (typeof RecordType)[keyof typeof RecordType];

/**
 * Record formats seen in the header's first byte for the info record.
 */
export const InfoRecordFormat = {
  Protobuf: 1,
  Json: 2,
} as const;
