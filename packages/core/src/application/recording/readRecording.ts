import type { Recording } from './Recording';
import type { RandomAccessSource } from '../../ports/RandomAccessSource';
import { selectCalibration } from '../../domain/format/calibration/selectCalibration';
import { readInfoRecord } from '../../domain/format/info/readInfoRecord';
import { TrailerRecords } from '../../domain/format/records/TrailerRecords';
import { readTrailer } from '../../domain/format/trailer/readTrailer';
import { CaptureClock } from '../../domain/motion/timing/CaptureClock';

/**
 * Use case: open a source and read everything needed to describe the recording, with the
 * minimum of I/O: one size lookup, the trailer's table of contents, then the info record. The
 * file's box structure is left to `inspectLayout`. A missing calibration is reported, not
 * fatal; stitching checks for it. The large records are read when asked for.
 */
export async function readRecording(source: RandomAccessSource): Promise<Recording> {
  const fileSize = await source.size();
  const trailer = await readTrailer(source, fileSize);
  const info = await readInfoRecord(source, trailer);
  const records = new TrailerRecords(source, trailer, info);
  return {
    info,
    calibration: selectCalibration(info.calibration),
    listsExposureRecord: records.listsExposure,
    captureClock: async (): Promise<CaptureClock | undefined> => {
      const origin = await records.firstFrameCaptureTime();
      return origin === undefined ? undefined : new CaptureClock(origin, info.gyroOffset);
    },
    readGyroRecord: () => records.readGyro(),
    readExposureRecord: () => records.readExposure(),
  };
}
