import type { Microseconds, Seconds } from '../../../shared/units/time';

export interface ExposureEntry {
  readonly timestamp: Microseconds;
  readonly exposure: Seconds;
}

/**
 * Capture timestamps and shutter durations of every frame the sensor produced, in order.
 */
export class ExposureRecord {
  public constructor(
    public readonly timestamps: Float64Array,
    public readonly exposures: Float64Array,
  ) {
    if (timestamps.length !== exposures.length) {
      throw new RangeError('exposure record arrays disagree on the entry count');
    }
  }

  public get length(): number {
    return this.timestamps.length;
  }

  public entryAt(index: number): ExposureEntry {
    return {
      timestamp: (this.timestamps[index] ?? NaN) as Microseconds,
      exposure: (this.exposures[index] ?? NaN) as Seconds,
    };
  }

  /**
   * Index of the first entry captured at or after `timestamp`, or the length when none is.
   */
  public indexAtOrAfter(timestamp: Microseconds): number {
    let low = 0;
    let high = this.timestamps.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if ((this.timestamps[middle] ?? Infinity) < timestamp) low = middle + 1;
      else high = middle;
    }
    return low;
  }
}
