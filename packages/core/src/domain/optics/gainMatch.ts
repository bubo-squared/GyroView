import { interpolateVectors, type Vector3 } from '../../shared/math/Vector3';
import { seconds, type Seconds } from '../../shared/units/time';

export interface GainMatchOptions {
  /**
   * Largest per-channel factor applied to a lens (and the smallest is its inverse): beyond it
   * the difference is not exposure but content, and matching would only chase it.
   */
  readonly maxGain: number;
  /**
   * How long the gains take to follow a change in the overlap's brightness.
   */
  readonly timeConstant: Seconds;
}

const DEFAULT_MAX_GAIN = 2;
const DEFAULT_TIME_CONSTANT_SECONDS = 1.5;
/**
 * A channel darker than this (0..1) carries no exposure information; its gain is left at one.
 */
const DARK_CHANNEL = 0.01;
const UNIT_GAIN: Vector3 = [1, 1, 1];

export const DEFAULT_GAIN_MATCH_OPTIONS: GainMatchOptions = {
  maxGain: DEFAULT_MAX_GAIN,
  timeConstant: seconds(DEFAULT_TIME_CONSTANT_SECONDS),
};

/**
 * Per-channel gains that bring every lens's overlap brightness to the first lens's. Lens 0 is
 * the reference and keeps unit gain; the first is the lens the viewer starts facing, so its
 * exposure is the one that must not shift under them.
 */
export function gainsMatching(overlapMeans: readonly Vector3[], maxGain: number): Vector3[] {
  const [reference] = overlapMeans;
  return reference
    ? overlapMeans.map((mean, lensIndex) =>
        lensIndex === 0 ? UNIT_GAIN : channelGains(reference, mean, maxGain),
      )
    : [];
}

function channelGains(reference: Vector3, mean: Vector3, maxGain: number): Vector3 {
  return [
    channelGain(reference[0], mean[0], maxGain),
    channelGain(reference[1], mean[1], maxGain),
    channelGain(reference[2], mean[2], maxGain),
  ];
}

function channelGain(reference: number, mean: number, maxGain: number): number {
  return reference < DARK_CHANNEL || mean < DARK_CHANNEL
    ? 1
    : Math.min(Math.max(reference / mean, 1 / maxGain), maxGain);
}

/**
 * Follows the matching gains over time with a first-order low-pass, so a cloud passing one
 * lens does not flicker the other. The first measurement is taken as is.
 */
export class GainMatcher {
  private current: readonly Vector3[] | undefined;
  private lastTime: Seconds | undefined;

  public constructor(private readonly options: GainMatchOptions = DEFAULT_GAIN_MATCH_OPTIONS) {}

  /**
   * Feeds the overlap means measured at `time` (media time) and returns the gains to apply.
   */
  public update(overlapMeans: readonly Vector3[], time: Seconds): readonly Vector3[] {
    const target = gainsMatching(overlapMeans, this.options.maxGain);
    const elapsed = this.lastTime === undefined ? Infinity : Math.max(time - this.lastTime, 0);
    this.lastTime = time;
    const weight = this.current ? 1 - Math.exp(-elapsed / this.options.timeConstant) : 1;
    const previous = this.current;
    this.current = target.map((gain, lensIndex) =>
      interpolateVectors(previous?.[lensIndex] ?? UNIT_GAIN, gain, weight),
    );
    return this.current;
  }
}
