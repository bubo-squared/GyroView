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
 * minimum of I/O (box headers, trailer table of contents, info record).
 */
export async function readRecording(source: RandomAccessSource): Promise<Recording> {
  const boxLayout = await scanBoxes(source);
  const trailer = await readTrailer(source);
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
    boxes: boxLayout.boxes,
    trailerWrapper: trailerWrapperOf(boxLayout),
    trailer,
    info,
    calibration: selectCalibration(info.calibration),
  });
}
