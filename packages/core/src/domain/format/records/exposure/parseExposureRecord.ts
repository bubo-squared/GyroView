import {
  EXPOSURE_DURATION_OFFSET,
  EXPOSURE_ENTRY_SIZE,
  EXPOSURE_TIMESTAMP_OFFSET,
} from './exposureLayout';
import { ByteReader } from '../../../../shared/binary/ByteReader';
import { hasErrorCode } from '../../../../shared/errors/GyroViewError';
import type { Microseconds } from '../../../../shared/units/time';
import { ExposureRecord } from '../../../motion/exposure/ExposureRecord';

/**
 * Decodes the exposure record into per-frame capture times, from stamps in the camera's unit
 * through `captureTimeOf`, and shutter times; bytes after the last whole entry are ignored.
 * Undefined when an entry cannot be a reading (a stamp past the safe integers, a shutter time
 * that is not finite, as a flipped bit leaves): entries belong to frames by their position, so
 * a damaged record is left out whole and frame timing falls back to its next source.
 */
export function parseExposureRecord(
  payload: Uint8Array,
  captureTimeOf: (stamp: number) => Microseconds,
): ExposureRecord | undefined {
  try {
    return decodeEntries(payload, captureTimeOf);
  } catch (error) {
    if (hasErrorCode(error, 'binary-unsafe-integer')) return undefined;
    throw error;
  }
}

function decodeEntries(
  payload: Uint8Array,
  captureTimeOf: (stamp: number) => Microseconds,
): ExposureRecord | undefined {
  const count = Math.floor(payload.byteLength / EXPOSURE_ENTRY_SIZE);
  const reader = new ByteReader(payload);
  const captureTimes = new Float64Array(count);
  const shutterTimes = new Float64Array(count);
  for (let index = 0; index < count; index += 1) {
    const offset = index * EXPOSURE_ENTRY_SIZE;
    captureTimes[index] = captureTimeOf(reader.uint64LeAt(offset + EXPOSURE_TIMESTAMP_OFFSET));
    shutterTimes[index] = reader.float64LeAt(offset + EXPOSURE_DURATION_OFFSET);
  }
  const areShutterTimesReadings = shutterTimes.every((time) => Number.isFinite(time));
  return areShutterTimesReadings ? new ExposureRecord(captureTimes, shutterTimes) : undefined;
}
