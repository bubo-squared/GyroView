import { GainMatcher, type Seconds, type Vector3 } from '@gyroview/core';

import type { GainMatchPass } from './GainMatchPass';

/**
 * Media time between measurements: exposure drifts over seconds, and a read-back per frame
 * would stall the GPU pipeline.
 */
const MEASURE_INTERVAL_SECONDS = 0.5;

/**
 * Keeps the lens gains matched over time: measures the seam after a presented frame every so
 * often, feeds the matcher and applies what it says. One measurement in flight at a time.
 */
export class GainMatching {
  private readonly matcher = new GainMatcher();
  private lastMeasuredAt: Seconds | undefined;
  private inFlight: Promise<void> | undefined;

  public constructor(
    private readonly pass: GainMatchPass,
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
    this.inFlight ??= this.run(mediaTime);
    return this.inFlight;
  }

  public dispose(): void {
    this.pass.dispose();
  }

  private async run(mediaTime: Seconds): Promise<void> {
    try {
      const means = await this.pass.measure();
      this.lastMeasuredAt = mediaTime;
      if (means) this.applyGains(this.matcher.update(means, mediaTime));
    } catch {
      // A lost context fails the read-back; the picture is still drawn and a later frame retries.
      this.lastMeasuredAt = mediaTime;
    } finally {
      this.inFlight = undefined;
    }
  }
}
