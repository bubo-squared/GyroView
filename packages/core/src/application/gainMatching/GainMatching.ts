import { GainMatcher } from '../../domain/colour/gainMatch';
import type { SeamMeter } from '../../ports/SeamMeter';
import type { Vector3 } from '../../shared/math/Vector3';
import { reportLater } from '../../shared/errors/reportLater';
import type { Seconds } from '../../shared/units/time';

/**
 * Media time between measurements: exposure drifts over seconds, and a read-back per frame
 * would stall the GPU pipeline.
 */
const MEASURE_INTERVAL_SECONDS = 0.5;

export interface GainMatchingParts {
  /**
   * Borrowed: whoever created it disposes it.
   */
  readonly meter: SeamMeter;
  /**
   * The lens the others are matched to, by its place in the meter's order (`referenceLensOf`).
   */
  readonly referenceLens: number;
  readonly applyGains: (gains: readonly Vector3[]) => void;
  readonly reportFailure?: (error: unknown) => void;
}

/**
 * Keeps the lens gains matched over time: measures the seam after a presented frame every so
 * often, feeds the matcher and applies what it says. One measurement in flight at a time; one
 * that lands after `stop` changes nothing. A meter that fails stops the matching, the gains left
 * as they are, and the failure is reported once.
 */
export class GainMatching {
  private readonly meter: SeamMeter;
  private readonly matcher: GainMatcher;
  private readonly applyGains: (gains: readonly Vector3[]) => void;
  private readonly reportFailure: (error: unknown) => void;
  private lastMeasuredAt: Seconds | undefined;
  private inFlight: Promise<void> | undefined;
  private isStopped = false;

  public constructor(parts: GainMatchingParts) {
    this.meter = parts.meter;
    this.matcher = new GainMatcher(parts.referenceLens);
    this.applyGains = parts.applyGains;
    this.reportFailure = parts.reportFailure ?? reportLater;
  }

  public afterPresent(mediaTime: Seconds): void {
    const isDue =
      this.lastMeasuredAt === undefined ||
      Math.abs(mediaTime - this.lastMeasuredAt) >= MEASURE_INTERVAL_SECONDS;
    if (isDue && !this.isStopped) void this.matchReporting(mediaTime);
  }

  /**
   * Measures and applies at once; joins a measurement already under way.
   */
  public matchNow(mediaTime: Seconds): Promise<void> {
    this.inFlight ??= this.measureAt(mediaTime);
    return this.inFlight;
  }

  public stop(): void {
    this.isStopped = true;
  }

  private async matchReporting(mediaTime: Seconds): Promise<void> {
    try {
      await this.matchNow(mediaTime);
    } catch (error) {
      this.reportFailure(error);
    }
  }

  /**
   * Counted from its start, so a failing meter is not asked again at every frame.
   */
  private async measureAt(mediaTime: Seconds): Promise<void> {
    this.lastMeasuredAt = mediaTime;
    try {
      const means = await this.meter.measure();
      if (means && !this.isStopped) this.applyGains(this.matcher.update(means, mediaTime));
    } catch (error) {
      this.isStopped = true;
      throw error;
    } finally {
      this.inFlight = undefined;
    }
  }
}
