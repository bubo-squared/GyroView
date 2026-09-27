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
 * Longer than any exposure a camera takes for one frame, night-lapses included; a flipped bit in
 * a float64 shutter time lands far beyond, or at NaN.
 */
const MAX_PLAUSIBLE_SHUTTER_SECONDS = 60;

/**
 * Decodes the exposure record into per-frame capture times, from stamps in the camera's unit
 * through `captureTimeOf`, and shutter times; bytes after the last whole entry are ignored.
 * Undefined when an entry cannot be a reading (a stamp past the safe integers or out of order, a
 * shutter time no camera takes, as a flipped bit leaves): entries belong to frames by their
 * position, so a damaged record is left out whole and frame timing falls back to its next source.
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
  const isReading =
    isInOrder(captureTimes) && shutterTimes.every((time) => isPlausibleShutterTime(time));
  return isReading ? new ExposureRecord(captureTimes, shutterTimes) : undefined;
}

/**
 * Capture times that go back betray a stray stamp, either way: a stamp moved forward makes the
 * next one go back.
 */
function isInOrder(captureTimes: Float64Array): boolean {
  return captureTimes.every(
    (time, index) => index === 0 || time >= (captureTimes[index - 1] ?? time),
  );
}

function isPlausibleShutterTime(time: number): boolean {
  return time >= 0 && time <= MAX_PLAUSIBLE_SHUTTER_SECONDS;
}
