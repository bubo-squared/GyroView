import { encodeBox } from './encodeBox';
import { BoxType } from '../domain/format/boxes/boxConstants';
import {
  FOOTER_MAGIC_OFFSET,
  FOOTER_TRAILER_SIZE_OFFSET,
  FOOTER_VERSION_OFFSET,
  INDEX_SLOT_FORMAT_OFFSET,
  INDEX_SLOT_ID_OFFSET,
  INDEX_SLOT_OFFSET_OFFSET,
  INDEX_SLOT_SIZE,
  INDEX_SLOT_SIZE_OFFSET,
  RECORD_HEADER_FORMAT_OFFSET,
  RECORD_HEADER_ID_OFFSET,
  RECORD_HEADER_SIZE,
  RECORD_HEADER_SIZE_OFFSET,
  RecordType,
  TRAILER_FOOTER_SIZE,
  TRAILER_MAGIC,
} from '../domain/format/constants';
import { encodeAscii } from './encodeAscii';
import { concatenated } from '../shared/binary/concatenated';

export interface FixtureRecordSpec {
  readonly id: number;
  readonly format?: number;
  readonly payload: Uint8Array;
}

export interface ExpectedRecord {
  readonly id: number;
  readonly format: number;
  readonly offset: number;
  readonly size: number;
}

export interface BuiltTrailerFile {
  readonly bytes: Uint8Array;
  readonly payloadStart: number;
  readonly records: readonly ExpectedRecord[];
  /**
   * Size of the index record, or 0 for the contiguous layout.
   */
  readonly indexSize: number;
}

export interface IndexedLayoutOptions {
  readonly alignment: number;
  /**
   * Newer firmware wraps the whole trailer in an `inst` box whose header precedes the payload.
   */
  readonly wrapInInstBox?: boolean;
}

const INDEX_SLOT_COUNT = 31;
const TRAILER_VERSION = 3;
const DEFAULT_FORMAT = 0;
const IS_LITTLE_ENDIAN = true;

/**
 * Assembles synthetic Insta360 files for tests: an arbitrary prefix standing in for the MP4,
 * then a trailer in either the indexed layout (records at aligned offsets, index last) or the
 * contiguous layout (records back to back, no index). Encodes with the same named constants the
 * parser reads with, so a layout change cannot leave the two silently agreeing on stale bytes.
 */
export class TrailerFixtureBuilder {
  private prefix: Uint8Array = new Uint8Array();
  private readonly records: FixtureRecordSpec[] = [];

  public withPrefix(bytes: Uint8Array): this {
    this.prefix = bytes;
    return this;
  }

  public addRecord(spec: FixtureRecordSpec): this {
    this.records.push(spec);
    return this;
  }

  public buildContiguous(): BuiltTrailerFile {
    const parts: Uint8Array[] = [];
    const expected: ExpectedRecord[] = [];
    let cursor = this.prefix.byteLength;
    for (const record of this.records) {
      expected.push(this.describe(record, cursor));
      parts.push(record.payload, encodeHeader(record));
      cursor += record.payload.byteLength + RECORD_HEADER_SIZE;
    }
    parts.push(encodeFooter(cursor - this.prefix.byteLength + TRAILER_FOOTER_SIZE));
    return {
      bytes: concatenated([this.prefix, ...parts]),
      payloadStart: this.prefix.byteLength,
      records: expected,
      indexSize: 0,
    };
  }

  public buildIndexed(options: IndexedLayoutOptions): BuiltTrailerFile {
    const payloadStart =
      this.prefix.byteLength + (options.wrapInInstBox ? RECORD_HEADER_SIZE + 2 : 0);
    const parts: Uint8Array[] = [];
    const expected: ExpectedRecord[] = [];
    let cursor = payloadStart;
    for (const record of this.records) {
      const aligned = alignUp(cursor, options.alignment);
      parts.push(new Uint8Array(aligned - cursor), record.payload);
      expected.push(this.describe(record, aligned));
      cursor = aligned + record.payload.byteLength;
    }
    const index = encodeIndex(expected, payloadStart);
    parts.push(
      index,
      encodeHeader({ id: RecordType.Index, format: DEFAULT_FORMAT, payload: index }),
    );
    cursor += index.byteLength + RECORD_HEADER_SIZE;
    parts.push(encodeFooter(cursor - payloadStart + TRAILER_FOOTER_SIZE));
    const payload = concatenated(parts);
    const trailer = options.wrapInInstBox ? encodeBox(BoxType.Insta360Trailer, payload) : payload;
    return {
      bytes: concatenated([this.prefix, trailer]),
      payloadStart,
      records: expected,
      indexSize: index.byteLength,
    };
  }

  private describe(record: FixtureRecordSpec, offset: number): ExpectedRecord {
    return {
      id: record.id,
      format: record.format ?? DEFAULT_FORMAT,
      offset,
      size: record.payload.byteLength,
    };
  }
}

function encodeHeader(record: FixtureRecordSpec): Uint8Array {
  const header = new Uint8Array(RECORD_HEADER_SIZE);
  const view = new DataView(header.buffer);
  view.setUint8(RECORD_HEADER_FORMAT_OFFSET, record.format ?? DEFAULT_FORMAT);
  view.setUint8(RECORD_HEADER_ID_OFFSET, record.id);
  view.setUint32(RECORD_HEADER_SIZE_OFFSET, record.payload.byteLength, IS_LITTLE_ENDIAN);
  return header;
}

function encodeFooter(trailerSize: number): Uint8Array {
  const footer = new Uint8Array(TRAILER_FOOTER_SIZE);
  const view = new DataView(footer.buffer);
  view.setUint32(FOOTER_TRAILER_SIZE_OFFSET, trailerSize, IS_LITTLE_ENDIAN);
  view.setUint32(FOOTER_VERSION_OFFSET, TRAILER_VERSION, IS_LITTLE_ENDIAN);
  footer.set(encodeAscii(TRAILER_MAGIC), FOOTER_MAGIC_OFFSET);
  return footer;
}

function encodeIndex(records: readonly ExpectedRecord[], payloadStart: number): Uint8Array {
  const index = new Uint8Array(INDEX_SLOT_COUNT * INDEX_SLOT_SIZE);
  const view = new DataView(index.buffer);
  for (const record of records) {
    const slot = record.id * INDEX_SLOT_SIZE;
    view.setUint8(slot + INDEX_SLOT_ID_OFFSET, record.id);
    view.setUint8(slot + INDEX_SLOT_FORMAT_OFFSET, record.format);
    view.setUint32(slot + INDEX_SLOT_SIZE_OFFSET, record.size, IS_LITTLE_ENDIAN);
    view.setUint32(slot + INDEX_SLOT_OFFSET_OFFSET, record.offset - payloadStart, IS_LITTLE_ENDIAN);
  }
  return index;
}

function alignUp(value: number, alignment: number): number {
  return Math.ceil(value / alignment) * alignment;
}
