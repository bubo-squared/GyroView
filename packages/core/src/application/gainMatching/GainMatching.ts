import { GainMatcher } from '../../domain/optics/gainMatch';
import type { SeamMeter } from '../../ports/SeamMeter';
import type { Vector3 } from '../../shared/math/Vector3';
import type { Seconds } from '../../shared/units/time';

/**
 * Media time between measurements: exposure drifts over seconds, and a read-back per frame
 * would stall the GPU pipeline.
 */
const MEASURE_INTERVAL_SECONDS = 0.5;

/**
 * Keeps the lens gains matched over time: measures the seam after a presented frame every so
 * often, feeds the matcher and applies what it says. One measurement in flight at a time; one
 * that lands after disposal changes nothing.
 */
export class GainMatching {
  private readonly matcher = new GainMatcher();
  private lastMeasuredAt: Seconds | undefined;
  private inFlight: Promise<void> | undefined;
  private isDisposed = false;

  public constructor(
    private readonly meter: SeamMeter,
    private readonly applyGains: (gains: readonly Vector3[]) => void,
  ) {}

  public afterPresent(mediaTime: Seconds): void {
    const isDue =
      this.lastMeasuredAt === undefined ||
      Math.abs(mediaTime - this.lastMeasuredAt) >= MEASURE_INTERVAL_SECONDS;
    if (isDue) void this.matchNow(mediaTime);
  }

  /**
   * Measures and applies at once; joins a measurement already under way.
   */
  public matchNow(mediaTime: Seconds): Promise<void> {
    this.inFlight ??= this.measureAt(mediaTime);
    return this.inFlight;
  }

  public dispose(): void {
    this.isDisposed = true;
    this.meter.dispose();
  }

  private async measureAt(mediaTime: Seconds): Promise<void> {
    try {
      const means = await this.meter.measure();
      this.lastMeasuredAt = mediaTime;
      if (means && !this.isDisposed) this.applyGains(this.matcher.update(means, mediaTime));
    } finally {
      this.inFlight = undefined;
    }
  }
}
