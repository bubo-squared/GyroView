import type { RandomAccessSource } from '../../ports/RandomAccessSource';
import {
  trailerWrapperOf,
  type BoxDescriptor,
  type TrailerWrapper,
} from '../../domain/format/boxes/BoxLayout';
import { scanBoxes } from '../../domain/format/boxes/scanBoxes';
import type { RecordLocation } from '../../domain/format/trailer/RecordLocation';
import { readTrailer } from '../../domain/format/trailer/readTrailer';

/**
 * How a file is laid out: its top-level boxes, how the trailer is attached, and where each of
 * the trailer's records lies. What an inspector shows; playing a recording needs none of it.
 */
export interface RecordingLayout {
  readonly fileSize: number;
  readonly boxes: readonly BoxDescriptor[];
  readonly trailerWrapper: TrailerWrapper;
  readonly trailerVersion: number;
  readonly trailerPayloadStart: number;
  /**
   * Every record the trailer lists, by id.
   */
  readonly records: readonly RecordLocation[];
}

/**
 * Use case: map out a file's structure, box by box and record by record.
 */
export async function inspectLayout(source: RandomAccessSource): Promise<RecordingLayout> {
  const fileSize = await source.size();
  const [boxLayout, trailer] = await Promise.all([
    scanBoxes(source, fileSize),
    readTrailer(source, fileSize),
  ]);
  return {
    fileSize,
    boxes: boxLayout.boxes,
    trailerWrapper: trailerWrapperOf(boxLayout),
    trailerVersion: trailer.footer.version,
    trailerPayloadStart: trailer.payloadStart,
    records: trailer.records.toSorted((left, right) => left.id - right.id),
  };
}
