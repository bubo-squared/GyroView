import { parseInfoRecord } from './parseInfoRecord';
import type { RecordingInfo } from './RecordingInfo';
import { RecordType } from '../constants';
import type { Trailer } from '../trailer/Trailer';
import type { RandomAccessSource } from '../../../ports/RandomAccessSource';
import { GyroViewError } from '../../../shared/errors/GyroViewError';

/**
 * The info record every camera recording carries, from where the trailer says it lies.
 */
export async function readInfoRecord(
  source: RandomAccessSource,
  trailer: Trailer,
): Promise<RecordingInfo> {
  const location = trailer.locationOf(RecordType.Info);
  if (!location) {
    throw new GyroViewError(
      'no-info-record',
      'the trailer has no info record; the file is not a camera recording',
    );
  }
  return parseInfoRecord(await source.read(location.payload), location.format);
}
