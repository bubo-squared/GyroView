import { FloatGyroSampleLayout } from './FloatGyroSampleLayout';
import type { GyroSampleLayout } from './GyroSampleLayout';
import { RawGyroSampleLayout } from './RawGyroSampleLayout';
import { ByteReader } from '../../../../shared/binary/ByteReader';
import { GyroViewError } from '../../../../shared/errors/GyroViewError';
import { VECTOR3_COMPONENTS } from '../../../../shared/math/Vector3';
import { GyroTrack } from '../../../motion/gyro/GyroTrack';
import type { SensorRanges } from '../../info/RecordingInfo';

/**
 * Plausible spacing between consecutive samples when guessing the layout: 100 Hz to 10 kHz.
 */
const MIN_PLAUSIBLE_INTERVAL_US = 100;
const MAX_PLAUSIBLE_INTERVAL_US = 10_000;
const SAMPLES_NEEDED_TO_GUESS = 2;

export interface GyroRecordHints {
  /**
   * `is_raw_gyro` from the info record when present; otherwise the layout is inferred from the
   * timestamps the candidate layouts decode.
   */
  readonly isRawGyro: boolean | undefined;
  readonly ranges: Partial<SensorRanges> | undefined;
}

export interface ParsedGyroRecord {
  readonly track: GyroTrack;
  readonly layout: GyroSampleLayout['name'];
  /**
   * Bytes after the last whole sample. Real ONE R recordings carry one; they are ignored.
   */
  readonly strayBytes: number;
}

/**
 * Decodes the gyro record payload into a {@link GyroTrack}. Whole samples only: a partial
 * sample at the end is tolerated and reported, never rejected.
 */
export function parseGyroRecord(payload: Uint8Array, hints: GyroRecordHints): ParsedGyroRecord {
  const layout = chooseLayout(payload, hints);
  const count = Math.floor(payload.byteLength / layout.sampleSize);
  const reader = new ByteReader(payload);
  const captureTimes = new Float64Array(count);
  const accelerations = new Float32Array(count * VECTOR3_COMPONENTS);
  const angularVelocities = new Float32Array(count * VECTOR3_COMPONENTS);
  for (let index = 0; index < count; index += 1) {
    const offset = index * layout.sampleSize;
    captureTimes[index] = layout.timestampAt(reader, offset);
    accelerations.set(layout.accelerationAt(reader, offset), index * VECTOR3_COMPONENTS);
    angularVelocities.set(layout.angularVelocityAt(reader, offset), index * VECTOR3_COMPONENTS);
  }
  return {
    track: new GyroTrack(captureTimes, accelerations, angularVelocities),
    layout: layout.name,
    strayBytes: payload.byteLength % layout.sampleSize,
  };
}

function chooseLayout(payload: Uint8Array, hints: GyroRecordHints): GyroSampleLayout {
  const raw = new RawGyroSampleLayout(hints.ranges);
  const float = new FloatGyroSampleLayout();
  if (hints.isRawGyro !== undefined) return hints.isRawGyro ? raw : float;
  const plausible = [raw, float].filter((layout) => hasPlausibleTimestamps(payload, layout));
  const [winner] = plausible;
  if (winner && plausible.length === 1) return winner;
  throw new GyroViewError(
    'unsupported-gyro-record',
    `cannot tell the gyro sample layout of a ${payload.byteLength}-byte record without the info record`,
  );
}

/**
 * A layout fits when it decodes at least two samples whose capture times increase by a plausible
 * IMU interval.
 */
function hasPlausibleTimestamps(payload: Uint8Array, layout: GyroSampleLayout): boolean {
  if (payload.byteLength < layout.sampleSize * SAMPLES_NEEDED_TO_GUESS) return false;
  const reader = new ByteReader(payload);
  try {
    const interval = layout.timestampAt(reader, layout.sampleSize) - layout.timestampAt(reader, 0);
    return interval >= MIN_PLAUSIBLE_INTERVAL_US && interval <= MAX_PLAUSIBLE_INTERVAL_US;
  } catch {
    return false;
  }
}
