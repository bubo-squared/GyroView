import {
  INDEX_SLOT_SIZE,
  RECORD_HEADER_SIZE,
  RecordType,
  TRAILER_FOOTER_SIZE,
  TRAILER_MAGIC,
} from '../../src/domain/format/constants';

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
}

export interface IndexedLayoutOptions {
  readonly alignment: number;
  /**
   * Newer firmware wraps the whole trailer in an `inst` box whose header precedes the payload.
   */
  readonly wrapInInstBox?: boolean;
}

const INDEX_SLOT_COUNT = 31;
const INST_BOX_HEADER_SIZE = 8;
const TRAILER_VERSION = 3;
const DEFAULT_FORMAT = 0;

/**
 * Assembles synthetic Insta360 files for tests: an arbitrary prefix standing in for the MP4,
 * then a trailer in either the indexed layout (records at aligned offsets, index last) or the
 * contiguous layout (records back to back, no index).
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
    const trailerSize = cursor - this.prefix.byteLength + TRAILER_FOOTER_SIZE;
    parts.push(encodeFooter(trailerSize));
    return {
      bytes: concat([this.prefix, ...parts]),
      payloadStart: this.prefix.byteLength,
      records: expected,
    };
  }

  public buildIndexed(options: IndexedLayoutOptions): BuiltTrailerFile {
    const boxHeaderSize = options.wrapInInstBox ? INST_BOX_HEADER_SIZE : 0;
    const payloadStart = this.prefix.byteLength + boxHeaderSize;
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
    const payload = concat(parts);
    const wrapped = options.wrapInInstBox
      ? concat([encodeInstBoxHeader(payload.byteLength), payload])
      : payload;
    return { bytes: concat([this.prefix, wrapped]), payloadStart, records: expected };
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
  view.setUint8(0, record.format ?? DEFAULT_FORMAT);
  view.setUint8(1, record.id);
  view.setUint32(2, record.payload.byteLength, true);
  return header;
}

function encodeInstBoxHeader(payloadSize: number): Uint8Array {
  const header = new Uint8Array(INST_BOX_HEADER_SIZE);
  new DataView(header.buffer).setUint32(0, payloadSize + INST_BOX_HEADER_SIZE);
  header.set(new TextEncoder().encode('inst'), 4);
  return header;
}

function encodeFooter(trailerSize: number): Uint8Array {
  const footer = new Uint8Array(TRAILER_FOOTER_SIZE);
  const view = new DataView(footer.buffer);
  view.setUint32(32, trailerSize, true);
  view.setUint32(36, TRAILER_VERSION, true);
  footer.set(new TextEncoder().encode(TRAILER_MAGIC), 40);
  return footer;
}

function encodeIndex(records: readonly ExpectedRecord[], payloadStart: number): Uint8Array {
  const index = new Uint8Array(INDEX_SLOT_COUNT * INDEX_SLOT_SIZE);
  const view = new DataView(index.buffer);
  for (const record of records) {
    const slot = record.id * INDEX_SLOT_SIZE;
    view.setUint8(slot, record.id);
    view.setUint8(slot + 1, record.format);
    view.setUint32(slot + 2, record.size, true);
    view.setUint32(slot + 6, record.offset - payloadStart, true);
  }
  return index;
}

function alignUp(value: number, alignment: number): number {
  return Math.ceil(value / alignment) * alignment;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const result = new Uint8Array(total);
  let cursor = 0;
  for (const part of parts) {
    result.set(part, cursor);
    cursor += part.byteLength;
  }
  return result;
}
