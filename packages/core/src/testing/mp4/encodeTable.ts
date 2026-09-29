import {
  TABLE_ENTRIES_OFFSET,
  TABLE_ENTRY_COUNT_OFFSET,
  type IntegerKind,
  type TableLayout,
} from '../../domain/format/mp4/mp4Layouts';
import { encodeFullBox } from '../encodeBox';

type IntegerWriter = (view: DataView, offset: number, value: number) => void;

/**
 * How each kind of integer in a box layout is written, big-endian.
 */
const WRITERS: Readonly<Record<IntegerKind, IntegerWriter>> = {
  uint32: (view, offset, value) => {
    view.setUint32(offset, value);
  },
  uint64: (view, offset, value) => {
    view.setBigUint64(offset, BigInt(value));
  },
  int32: (view, offset, value) => {
    view.setInt32(offset, value);
  },
  int64: (view, offset, value) => {
    view.setBigInt64(offset, BigInt(value));
  },
};

export function writeInteger(
  view: DataView,
  at: { offset: number; kind: IntegerKind },
  value: number,
): void {
  WRITERS[at.kind](view, at.offset, value);
}

export interface TableBox<Field extends string> {
  readonly type: string;
  readonly version: number;
  readonly layout: TableLayout<Field>;
}

/**
 * A table box: its entry count, then each row's fields where its layout puts them.
 */
export function encodeTable<Field extends string>(
  box: TableBox<Field>,
  rows: readonly Readonly<Record<Field, number>>[],
): Uint8Array {
  const { entrySize, fields } = box.layout;
  const payload = new Uint8Array(TABLE_ENTRIES_OFFSET + rows.length * entrySize);
  const view = new DataView(payload.buffer);
  view.setUint32(TABLE_ENTRY_COUNT_OFFSET, rows.length);
  for (const [index, row] of rows.entries()) {
    const entry = new DataView(payload.buffer, TABLE_ENTRIES_OFFSET + index * entrySize, entrySize);
    for (const field of Object.keys(fields) as Field[])
      writeInteger(entry, fields[field], row[field]);
  }
  return encodeFullBox(box.type, { version: box.version }, payload);
}
