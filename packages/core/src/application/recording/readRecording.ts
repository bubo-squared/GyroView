import { Recording } from './Recording';
import type { RandomAccessSource } from '../../ports/RandomAccessSource';
import { trailerWrapperOf } from '../../domain/format/boxes/BoxLayout';
import { scanBoxes } from '../../domain/format/boxes/scanBoxes';
import { selectCalibration } from '../../domain/format/calibration/selectCalibration';
import { readInfoRecord } from '../../domain/format/info/readInfoRecord';
import { TrailerRecords } from '../../domain/format/records/TrailerRecords';
import { readTrailer } from '../../domain/format/trailer/readTrailer';

/**
 * Use case: open a source and read everything needed to describe the recording, with the
 * minimum of I/O: one size lookup, box headers and trailer table of contents in parallel, then
 * the info record. A missing calibration is reported, not fatal; stitching checks for it.
 */
export async function readRecording(source: RandomAccessSource): Promise<Recording> {
  const fileSize = await source.size();
  const [boxLayout, trailer] = await Promise.all([
    scanBoxes(source, fileSize),
    readTrailer(source, fileSize),
  ]);
  const info = await readInfoRecord(source, trailer);
  return new Recording({
    fileSize,
    boxes: boxLayout.boxes,
    trailerWrapper: trailerWrapperOf(boxLayout),
    trailer,
    info,
    calibration: selectCalibration(info.calibration),
    records: new TrailerRecords({ source, trailer, info }),
  });
}
