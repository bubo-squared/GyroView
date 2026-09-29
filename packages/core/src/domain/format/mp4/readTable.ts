import { unreadableMovie } from './movieBoxes';
import {
  TABLE_ENTRIES_OFFSET,
  TABLE_ENTRY_COUNT_OFFSET,
  type IntegerField,
  type IntegerKind,
  type TableLayout,
} from './mp4Layouts';
import type { ByteReader } from '../../../shared/binary/ByteReader';

type IntegerReader = (reader: ByteReader, offset: number) => number;

/**
 * How each kind of integer in a box layout is read, big-endian.
 */
const READERS: Readonly<Record<IntegerKind, IntegerReader>> = {
  uint16: (reader, offset) => reader.uint16BeAt(offset),
  uint32: (reader, offset) => reader.uint32BeAt(offset),
  uint64: (reader, offset) => reader.uint64BeAt(offset),
  int32: (reader, offset) => reader.int32BeAt(offset),
  int64: (reader, offset) => reader.int64BeAt(offset),
};

/**
 * The integer a layout puts at `field`, counted from `base`.
 */
export function readInteger(reader: ByteReader, field: IntegerField, base = 0): number {
  return READERS[field.kind](reader, base + field.offset);
}

/**
 * A table box's entries, one column per field, read from its content after the version and
 * flags.
 */
export function readTableColumns<Field extends string>(
  content: ByteReader,
  layout: TableLayout<Field>,
): Record<Field, number[]> {
  const count = content.uint32BeAt(TABLE_ENTRY_COUNT_OFFSET);
  if (TABLE_ENTRIES_OFFSET + count * layout.entrySize > content.length) {
    throw unreadableMovie(`has a table of ${count} entries that do not fit in its box`);
  }
  const fields = Object.keys(layout.fields) as Field[];
  const columns = {} as Record<Field, number[]>;
  for (const field of fields) {
    columns[field] = Array.from({ length: count }, (_, index) =>
      readInteger(content, layout.fields[field], TABLE_ENTRIES_OFFSET + index * layout.entrySize),
    );
  }
  return columns;
}
