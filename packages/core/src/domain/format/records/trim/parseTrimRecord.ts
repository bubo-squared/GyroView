import { ByteReader } from '../../../../shared/binary/ByteReader';

/**
 * The record the Insta360 app adds when it trims a recording: ASCII `TEO1`, two u16 fields (1 on
 * every file at hand, meaning unknown), then the u32 LE frame of the original recording the
 * trimmed clip starts at, then zeros to 28 bytes. Read from two ONE R clips trimmed in the app on
 * 2026-10-17 and checked against their originals by matching frame content; the app keeps the
 * original's info, gyro and exposure records as they were.
 */
const TRIM_RECORD_MAGIC = 'TEO1';
const TRIM_RECORD_MAGIC_OFFSET = 0;
const TRIM_RECORD_START_FRAME_OFFSET = 8;
const TRIM_RECORD_START_FRAME_SIZE = 4;
const TRIM_RECORD_MIN_SIZE = TRIM_RECORD_START_FRAME_OFFSET + TRIM_RECORD_START_FRAME_SIZE;

/**
 * Where a clip trimmed in the Insta360 app starts in the recording it was cut from.
 */
export interface TrimRecord {
  /**
   * The original recording's frame, counted from its first encoded frame, that is the clip's
   * first frame.
   */
  readonly startFrame: number;
}

/**
 * Undefined for a record that is not a trim record or is cut short: the clip is then timed from
 * the original's first frame.
 */
export function parseTrimRecord(payload: Uint8Array): TrimRecord | undefined {
  if (payload.byteLength < TRIM_RECORD_MIN_SIZE) return undefined;
  const reader = new ByteReader(payload);
  const magic = reader.asciiAt(TRIM_RECORD_MAGIC_OFFSET, TRIM_RECORD_MAGIC.length);
  return magic === TRIM_RECORD_MAGIC
    ? { startFrame: reader.uint32LeAt(TRIM_RECORD_START_FRAME_OFFSET) }
    : undefined;
}
