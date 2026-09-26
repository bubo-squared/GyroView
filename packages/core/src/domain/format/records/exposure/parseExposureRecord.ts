import {
  EXPOSURE_DURATION_OFFSET,
  EXPOSURE_ENTRY_SIZE,
  EXPOSURE_TIMESTAMP_OFFSET,
} from './exposureLayout';
import { ByteReader } from '../../../../shared/binary/ByteReader';
import type { Microseconds } from '../../../../shared/units/time';
import { ExposureRecord } from '../../../motion/exposure/ExposureRecord';

/**
 * Decodes the exposure record into per-frame capture times, from stamps in the camera's unit
 * through `captureTimeOf`, and shutter times; bytes after the last whole entry are ignored.
 */
export function parseExposureRecord(
  payload: Uint8Array,
  captureTimeOf: (stamp: number) => Microseconds,
): ExposureRecord {
  const count = Math.floor(payload.byteLength / EXPOSURE_ENTRY_SIZE);
  const reader = new ByteReader(payload);
  const captureTimes = new Float64Array(count);
  const shutterTimes = new Float64Array(count);
  for (let index = 0; index < count; index += 1) {
    const offset = index * EXPOSURE_ENTRY_SIZE;
    captureTimes[index] = captureTimeOf(reader.uint64LeAt(offset + EXPOSURE_TIMESTAMP_OFFSET));
    shutterTimes[index] = reader.float64LeAt(offset + EXPOSURE_DURATION_OFFSET);
  }
  return new ExposureRecord(captureTimes, shutterTimes);
}
