import { FloatGyroSampleLayout } from './FloatGyroSampleLayout';
import { FLOAT_SAMPLE_SIZE } from './gyroLayouts';
import type { GyroSampleLayout } from './GyroSampleLayout';
import { RawGyroSampleLayout } from './RawGyroSampleLayout';
import { ByteReader } from '../../../../shared/binary/ByteReader';
import { GyroViewError, hasErrorCode } from '../../../../shared/errors/GyroViewError';
import { VECTOR3_COMPONENTS, type Vector3 } from '../../../../shared/math/Vector3';
import { GyroTrack, type GyroSample } from '../../../motion/gyro/GyroTrack';
import { repairedTimeline } from '../../../motion/gyro/repairedTimeline';
import type { SensorRanges } from '../../info/RecordingInfo';

/**
 * Plausible spacing between consecutive samples when guessing the layout: 100 Hz to 10 kHz.
 */
const MIN_PLAUSIBLE_INTERVAL_US = 100;
const MAX_PLAUSIBLE_INTERVAL_US = 10_000;
const SAMPLES_NEEDED_TO_GUESS = 2;
/**
 * Readings past these are no motion a camera makes: the X5 measures up to 16 g and 2000 degrees a
 * second (35 rad/s). A flipped bit in a float64 reading lands far beyond them, or at NaN.
 */
const MAX_PLAUSIBLE_ACCELERATION_G = 64;
const MAX_PLAUSIBLE_ANGULAR_VELOCITY_RAD_S = 100;

export interface GyroLayoutHints {
  /**
   * `is_raw_gyro` from the info record when present; otherwise the layout is inferred from the
   * timestamps the candidate layouts decode.
   */
  readonly isRawGyro: boolean | undefined;
  readonly ranges: Partial<SensorRanges> | undefined;
}

export interface ParsedGyroRecord {
  readonly track: GyroTrack;
  /**
   * The name of the sample layout the record was read with.
   */
  readonly layout: string;
  /**
   * Bytes after the last whole sample. Real ONE R recordings carry one; they are ignored.
   */
  readonly strayBytes: number;
  /**
   * Samples left out because their bytes cannot be a reading (see {@link parseGyroRecord}).
   */
  readonly damagedSamples: number;
}

/**
 * Enough leading bytes of a gyro record to tell its layout: two samples of the larger layout.
 */
export const GYRO_LAYOUT_PROBE_SIZE = FLOAT_SAMPLE_SIZE * SAMPLES_NEEDED_TO_GUESS;

/**
 * The sample layout of the gyro record: from the info record's flag when present, otherwise from
 * the timestamps the candidates decode in the record's first bytes (`head`). Undefined when
 * there is neither a flag nor a record to look at.
 */
export function selectGyroSampleLayout(
  hints: GyroLayoutHints,
  head: Uint8Array | undefined,
): GyroSampleLayout | undefined {
  const raw = new RawGyroSampleLayout(hints.ranges);
  const float = new FloatGyroSampleLayout();
  if (hints.isRawGyro !== undefined) return hints.isRawGyro ? raw : float;
  if (head === undefined) return undefined;
  const plausible = [raw, float].filter((layout) => hasPlausibleTimestamps(head, layout));
  const [winner] = plausible;
  if (winner && plausible.length === 1) return winner;
  throw new GyroViewError(
    'unsupported-gyro-record',
    `cannot tell the gyro sample layout from the first ${head.byteLength} bytes without the info record`,
  );
}

/**
 * Decodes the gyro record payload into a {@link GyroTrack} with the given layout. Whole samples
 * only: a partial sample at the end is tolerated and reported, never rejected. So is a sample
 * whose bytes cannot be a reading (a stamp past the safe integers, a value no camera measures,
 * as a flipped bit leaves): each sample carries its own time, so the others still count. Stamps
 * that stray from their neighbours are mended (see {@link repairedTimeline}).
 */
export function parseGyroRecord(payload: Uint8Array, layout: GyroSampleLayout): ParsedGyroRecord {
  const count = Math.floor(payload.byteLength / layout.sampleSize);
  const reader = new ByteReader(payload);
  const columns = new SampleColumns(count);
  for (let index = 0; index < count; index += 1) {
    const sample = readableSampleAt(reader, layout, index * layout.sampleSize);
    if (sample) columns.push(sample);
  }
  return {
    track: columns.toTrack(),
    layout: layout.name,
    strayBytes: payload.byteLength % layout.sampleSize,
    damagedSamples: count - columns.length,
  };
}

function readableSampleAt(
  reader: ByteReader,
  layout: GyroSampleLayout,
  offset: number,
): GyroSample | undefined {
  try {
    const sample = {
      captureTime: layout.timestampAt(reader, offset),
      acceleration: layout.accelerationAt(reader, offset),
      angularVelocity: layout.angularVelocityAt(reader, offset),
    };
    const isReading =
      isWithin(sample.acceleration, MAX_PLAUSIBLE_ACCELERATION_G) &&
      isWithin(sample.angularVelocity, MAX_PLAUSIBLE_ANGULAR_VELOCITY_RAD_S);
    return isReading ? sample : undefined;
  } catch (error) {
    if (hasErrorCode(error, 'binary-unsafe-integer')) return undefined;
    throw error;
  }
}

function isWithin(vector: Vector3, bound: number): boolean {
  return vector.every((component) => Math.abs(component) <= bound);
}

/**
 * The samples kept so far, in the columns a {@link GyroTrack} stores them in.
 */
class SampleColumns {
  public length = 0;
  private readonly captureTimes: Float64Array;
  private readonly accelerations: Float32Array;
  private readonly angularVelocities: Float32Array;

  public constructor(capacity: number) {
    this.captureTimes = new Float64Array(capacity);
    this.accelerations = new Float32Array(capacity * VECTOR3_COMPONENTS);
    this.angularVelocities = new Float32Array(capacity * VECTOR3_COMPONENTS);
  }

  public push(sample: GyroSample): void {
    this.captureTimes[this.length] = sample.captureTime;
    this.accelerations.set(sample.acceleration, this.length * VECTOR3_COMPONENTS);
    this.angularVelocities.set(sample.angularVelocity, this.length * VECTOR3_COMPONENTS);
    this.length += 1;
  }

  public toTrack(): GyroTrack {
    const vectors = this.length * VECTOR3_COMPONENTS;
    return new GyroTrack(
      repairedTimeline(this.captureTimes.subarray(0, this.length)),
      this.accelerations.subarray(0, vectors),
      this.angularVelocities.subarray(0, vectors),
    );
  }
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
