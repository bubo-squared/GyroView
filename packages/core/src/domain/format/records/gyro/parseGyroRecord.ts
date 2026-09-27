import { FloatGyroSampleLayout } from './FloatGyroSampleLayout';
import { FLOAT_SAMPLE_SIZE } from './gyroLayouts';
import type { GyroSampleLayout } from './GyroSampleLayout';
import { RawGyroSampleLayout } from './RawGyroSampleLayout';
import { ByteReader } from '../../../../shared/binary/ByteReader';
import { GyroViewError, hasErrorCode } from '../../../../shared/errors/GyroViewError';
import { VECTOR3_COMPONENTS, type Vector3 } from '../../../../shared/math/Vector3';
import { GyroTrack, type GyroSample } from '../../../motion/gyro/GyroTrack';
import { medianStep } from '../../../motion/gyro/medianStep';
import { repairedTimeline } from '../../../motion/gyro/repairedTimeline';
import type { SensorRanges } from '../../info/RecordingInfo';

/**
 * Plausible spacing between consecutive samples when guessing the layout: 100 Hz to 10 kHz.
 */
const MIN_PLAUSIBLE_INTERVAL_US = 100;
const MAX_PLAUSIBLE_INTERVAL_US = 10_000;
/**
 * The samples the layout is told from when the info record does not say: enough that a few
 * uninitialised or glitched stamps at the start are outvoted, in one small read.
 */
const SAMPLES_TO_GUESS_FROM = 32;
const MIN_SAMPLES_TO_GUESS_FROM = 2;
/**
 * Readings past these are no motion a camera makes: the X5 declares a 32 g and a 2000 degrees a
 * second (35 rad/s) range. A flipped bit in a float64 reading lands far beyond them, or at NaN.
 */
const MAX_PLAUSIBLE_ACCELERATION_G = 64;
const MAX_PLAUSIBLE_ANGULAR_VELOCITY_RAD_S = 100;
/**
 * No motion changes this much from one sample to the next and back: a raw reading's high bits
 * (2000 and 1000 degrees a second, 32 and 16 g on the X5) leap further, inside the bounds.
 */
const MAX_ANGULAR_VELOCITY_STEP_RAD_S = 10;
const MAX_ACCELERATION_STEP_G = 8;

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
  /**
   * Stamps put back where their neighbours say they belong (see {@link repairedTimeline}).
   */
  readonly mendedStamps: number;
}

/**
 * Enough leading bytes of a gyro record to tell its layout, in samples of the larger layout.
 */
export const GYRO_LAYOUT_PROBE_SIZE = FLOAT_SAMPLE_SIZE * SAMPLES_TO_GUESS_FROM;

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
  columns.dropSpikes();
  const timeline = repairedTimeline(columns.captureTimes());
  return {
    track: columns.toTrack(timeline.times),
    layout: layout.name,
    strayBytes: payload.byteLength % layout.sampleSize,
    damagedSamples: count - columns.length,
    mendedStamps: timeline.mended,
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
  private readonly recordedTimes: Float64Array;
  private readonly accelerations: Float32Array;
  private readonly angularVelocities: Float32Array;

  public constructor(capacity: number) {
    this.recordedTimes = new Float64Array(capacity);
    this.accelerations = new Float32Array(capacity * VECTOR3_COMPONENTS);
    this.angularVelocities = new Float32Array(capacity * VECTOR3_COMPONENTS);
  }

  public push(sample: GyroSample): void {
    this.recordedTimes[this.length] = sample.captureTime;
    this.accelerations.set(sample.acceleration, this.length * VECTOR3_COMPONENTS);
    this.angularVelocities.set(sample.angularVelocity, this.length * VECTOR3_COMPONENTS);
    this.length += 1;
  }

  /**
   * Leaves out samples whose reading leaps away from both neighbours while they agree: a flipped
   * high bit in a raw reading stays within the bounds, but no motion changes that fast for one
   * sample and back. Compacts in place; each check reads only samples not yet moved over.
   */
  public dropSpikes(): void {
    let kept = 0;
    for (let index = 0; index < this.length; index += 1) {
      if (this.isSpikeAt(index)) continue;
      this.moveSample(index, kept);
      kept += 1;
    }
    this.length = kept;
  }

  /**
   * The stamps as recorded, to be mended before they make a track.
   */
  public captureTimes(): Float64Array {
    return this.recordedTimes.subarray(0, this.length);
  }

  public toTrack(captureTimes: Float64Array): GyroTrack {
    const vectors = this.length * VECTOR3_COMPONENTS;
    return new GyroTrack(
      captureTimes,
      this.accelerations.subarray(0, vectors),
      this.angularVelocities.subarray(0, vectors),
    );
  }
  private isSpikeAt(index: number): boolean {
    const hasNeighbours = index > 0 && index < this.length - 1;
    return (
      hasNeighbours &&
      (isSpike(this.angularVelocities, index, MAX_ANGULAR_VELOCITY_STEP_RAD_S) ||
        isSpike(this.accelerations, index, MAX_ACCELERATION_STEP_G))
    );
  }

  private moveSample(from: number, to: number): void {
    if (from === to) return;
    this.recordedTimes[to] = this.recordedTimes[from] ?? 0;
    for (const vectors of [this.accelerations, this.angularVelocities]) {
      vectors.copyWithin(
        to * VECTOR3_COMPONENTS,
        from * VECTOR3_COMPONENTS,
        (from + 1) * VECTOR3_COMPONENTS,
      );
    }
  }
}

/**
 * A layout fits when the stamps it decodes step by a plausible IMU interval: the median step,
 * so a few stamps left at zero or glitched at the start do not decide.
 */
function hasPlausibleTimestamps(payload: Uint8Array, layout: GyroSampleLayout): boolean {
  const stamps = stampsOf(payload, layout);
  if (stamps.length < MIN_SAMPLES_TO_GUESS_FROM) return false;
  const median = medianStep(stamps);
  return median >= MIN_PLAUSIBLE_INTERVAL_US && median <= MAX_PLAUSIBLE_INTERVAL_US;
}

/**
 * The stamps `layout` decodes from the leading samples; one that cannot be a stamp is skipped.
 */
function stampsOf(payload: Uint8Array, layout: GyroSampleLayout): Float64Array {
  const reader = new ByteReader(payload);
  const count = Math.floor(payload.byteLength / layout.sampleSize);
  const stamps: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const stamp = stampAt(reader, layout, index * layout.sampleSize);
    if (stamp !== undefined) stamps.push(stamp);
  }
  return Float64Array.from(stamps);
}

function stampAt(reader: ByteReader, layout: GyroSampleLayout, offset: number): number | undefined {
  try {
    return layout.timestampAt(reader, offset);
  } catch (error) {
    if (hasErrorCode(error, 'binary-unsafe-integer')) return undefined;
    throw error;
  }
}

/**
 * The reading at `index` leaps from both neighbours by more than `step`, which agree within it.
 */
function isSpike(vectors: Float32Array, index: number, step: number): boolean {
  const distance = (a: number, b: number): number => {
    let largest = 0;
    for (let axis = 0; axis < VECTOR3_COMPONENTS; axis += 1) {
      const difference =
        (vectors[a * VECTOR3_COMPONENTS + axis] ?? 0) -
        (vectors[b * VECTOR3_COMPONENTS + axis] ?? 0);
      largest = Math.max(largest, Math.abs(difference));
    }
    return largest;
  };
  return (
    distance(index, index - 1) > step &&
    distance(index, index + 1) > step &&
    distance(index - 1, index + 1) <= step
  );
}
