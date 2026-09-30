import type { SampleTable } from '../../domain/container/SampleTable';
import type { BoxDescriptor } from '../../domain/format/boxes/BoxLayout';
import { scanBoxes } from '../../domain/format/boxes/scanBoxes';
import { Mp4BoxType } from '../../domain/format/mp4/mp4BoxTypes';
import { parseMovie } from '../../domain/format/mp4/parseMovie';
import type { RandomAccessSource } from '../../ports/RandomAccessSource';
import { GyroViewError } from '../../shared/errors/GyroViewError';
import { concatenated } from '../../shared/binary/concatenated';

/**
 * A file's sample table, and the bytes of its file type and movie boxes, one after the other:
 * what a codec reader needs to tell each track's decoder configuration.
 */
export interface ReadSampleTable {
  readonly table: SampleTable;
  readonly movieBytes: Uint8Array;
}

/**
 * Use case: read where every sample of a file lies and when it shows. The top-level boxes are
 * walked header by header, then the file type and the movie box are read whole, once each; not
 * a byte of the media data is read.
 */
export async function readSampleTable(source: RandomAccessSource): Promise<ReadSampleTable> {
  const boxes = await scanBoxes(source, await source.size());
  const movie = boxes.find((box) => box.type === Mp4BoxType.Movie);
  if (!movie) {
    throw new GyroViewError(
      'unsupported-container',
      'the file has no movie box to read its samples from',
    );
  }
  const fileType = boxes.find((box) => box.type === Mp4BoxType.FileType);
  const [fileTypeBytes, movieBox] = await Promise.all([
    bytesOf(source, fileType),
    bytesOf(source, movie),
  ]);
  return { table: parseMovie(movieBox), movieBytes: concatenated([fileTypeBytes, movieBox]) };
}

function bytesOf(source: RandomAccessSource, box: BoxDescriptor | undefined): Promise<Uint8Array> {
  return box ? source.read(box.range) : Promise.resolve(new Uint8Array());
}
