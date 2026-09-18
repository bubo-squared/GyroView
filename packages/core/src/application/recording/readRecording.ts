import { Recording } from './Recording';
import type { RandomAccessSource } from '../../ports/RandomAccessSource';
import { trailerWrapperOf } from '../../domain/format/boxes/BoxLayout';
import { scanBoxes } from '../../domain/format/boxes/scanBoxes';
import { RecordType } from '../../domain/format/constants';
import { parseInfoRecord } from '../../domain/format/info/parseInfoRecord';
import { readTrailer } from '../../domain/format/trailer/readTrailer';
import { selectCalibration } from '../../domain/optics/selectCalibration';
import { GyroViewError } from '../../shared/errors/GyroViewError';

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
  const infoLocation = trailer.locationOf(RecordType.Info);
  if (!infoLocation) {
    throw new GyroViewError(
      'no-info-record',
      'the trailer has no info record; the file is not a camera recording',
    );
  }
  const info = parseInfoRecord(await source.read(infoLocation.payload), infoLocation.format);
  return new Recording({
    source,
    fileSize,
    boxes: boxLayout.boxes,
    trailerWrapper: trailerWrapperOf(boxLayout),
    trailer,
    info,
    calibration: selectCalibration(info.calibration),
  });
}
