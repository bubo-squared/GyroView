import { FloatGyroSampleLayout } from './FloatGyroSampleLayout';
import { FLOAT_SAMPLE_SIZE } from './gyroLayouts';
import type { GyroSampleLayout } from './GyroSampleLayout';
import { RawGyroSampleLayout } from './RawGyroSampleLayout';
import { SampleColumns } from './SampleColumns';
import { ByteReader } from '../../../../shared/binary/ByteReader';
import { GyroViewError, hasErrorCode } from '../../../../shared/errors/GyroViewError';
import type { Vector3 } from '../../../../shared/math/Vector3';
import type { GyroSample, GyroTrack } from '../../../motion/gyro/GyroTrack';
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
 * only: a partial sample at the end is tolerated and reported, never rejected. So is a sample whose
 * bytes cannot be a reading (a stamp past the safe integers, a value no camera measures, a
 * component a flipped bit moved, a slot left all zero): each sample carries its own time, so the
 * others still count.
 * Stamps that stray from their neighbours are mended (see {@link repairedTimeline}).
 */
export function parseGyroRecord(payload: Uint8Array, layout: GyroSampleLayout): ParsedGyroRecord {
  const count = Math.floor(payload.byteLength / layout.sampleSize);
  const reader = new ByteReader(payload);
  const columns = new SampleColumns(count);
  for (let index = 0; index < count; index += 1) {
    const sample = readableSampleAt(reader, layout, index * layout.sampleSize);
    if (sample) columns.push(sample);
  }
  columns.dropFlippedBits(layout.flipSteps);
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
    const captureTime = layout.timestampAt(reader, offset);
    if (captureTime === 0 && isUnwritten(reader.bytesAt(offset, layout.sampleSize)))
      return undefined;
    const sample = {
      captureTime,
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

/**
 * A sample left all zero, as a camera leaves the first slots it never wrote: in the raw layout
 * it would read the negative full range on every axis, which no sensor measures.
 */
function isUnwritten(sample: Uint8Array): boolean {
  return sample.every((byte) => byte === 0);
}

function isWithin(vector: Vector3, bound: number): boolean {
  return vector.every((component) => Math.abs(component) <= bound);
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
