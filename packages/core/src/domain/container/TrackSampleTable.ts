import type { KeyframeRule } from './KeyframeRule';
import { presentationOrderOf } from './presentationOrder';
import { ByteRange } from '../../shared/binary/ByteRange';
import type { ReadonlyFloat64Array } from '../../shared/binary/ReadonlyTypedArray';
import { ensureIndexInRange, ensureInvariant } from '../../shared/errors/GyroViewError';
import { countAtOrBelow } from '../../shared/math/countAtOrBelow';
import { seconds, type Seconds } from '../../shared/units/time';

export type TrackKind = 'video' | 'audio';

export interface TrackSampleTableParts {
  readonly trackId: number;
  readonly kind: TrackKind;
  /**
   * Per sample, in decode order: where it starts in the file and how many bytes it takes.
   */
  readonly offsets: ReadonlyFloat64Array;
  readonly sizes: ReadonlyFloat64Array;
  /**
   * Per sample, in decode order: when it shows and for how long, in seconds of track time.
   */
  readonly timestamps: ReadonlyFloat64Array;
  readonly durations: ReadonlyFloat64Array;
  /**
   * The samples decoding may start at, in ascending order; undefined when every sample is one.
   */
  readonly syncSamples: readonly number[] | undefined;
  /**
   * When the last sample shown stops showing.
   */
  readonly end: Seconds;
  readonly keyframeRule: KeyframeRule;
}

/**
 * One track's samples as its sample table describes them: where each lies, when it shows and
 * where decoding may start. Samples are numbered from zero in decode order; the presentation
 * order, which composition offsets may make another, is kept beside it.
 */
export class TrackSampleTable {
  public readonly trackId: number;
  public readonly kind: TrackKind;
  public readonly end: Seconds;
  public readonly keyframeRule: KeyframeRule;
  /**
   * The samples in the order they show; ties keep decode order.
   */
  private readonly presentationOrder: readonly number[];

  public constructor(private readonly parts: TrackSampleTableParts) {
    const { length } = parts.offsets;
    const columns = [parts.sizes, parts.timestamps, parts.durations];
    ensureInvariant(
      columns.every((column) => column.length === length),
      `the sample table of track ${parts.trackId} disagrees on its sample count`,
    );
    ensureInvariant(
      isAscendingWithin(parts.syncSamples ?? [], length),
      `the sync samples of track ${parts.trackId} are not samples of it in order`,
    );
    this.trackId = parts.trackId;
    this.kind = parts.kind;
    this.end = parts.end;
    this.keyframeRule = parts.keyframeRule;
    this.presentationOrder = presentationOrderOf(parts.timestamps);
  }

  public get sampleCount(): number {
    return this.parts.offsets.length;
  }

  public rangeOf(sample: number): ByteRange {
    this.ensureSample(sample);
    return ByteRange.of(this.parts.offsets[sample] ?? 0, this.parts.sizes[sample] ?? 0);
  }

  public timestampOf(sample: number): Seconds {
    this.ensureSample(sample);
    return seconds(this.parts.timestamps[sample] ?? 0);
  }

  public durationOf(sample: number): Seconds {
    this.ensureSample(sample);
    return seconds(this.parts.durations[sample] ?? 0);
  }

  public isSync(sample: number): boolean {
    this.ensureSample(sample);
    return this.syncSampleAtOrBefore(sample) === sample;
  }

  /**
   * The sample on screen at `time`: the last to show at or before it. Undefined before the first.
   */
  public sampleShownAt(time: Seconds): number | undefined {
    const shownSoFar = countAtOrBelow(
      this.presentationOrder.length,
      (index) => this.parts.timestamps[this.presentationOrder[index] ?? 0] ?? Infinity,
      time,
    );
    return this.presentationOrder[shownSoFar - 1];
  }

  /**
   * The sample decoding for `time` starts at: the sync sample at or before the one on screen.
   */
  public keyframeAt(time: Seconds): number | undefined {
    const shown = this.sampleShownAt(time);
    return shown === undefined ? undefined : this.syncSampleAtOrBefore(shown);
  }

  public syncSampleAtOrBefore(sample: number): number | undefined {
    const { syncSamples } = this.parts;
    if (!syncSamples) return sample >= 0 ? sample : undefined;
    const count = countAtOrBelow(syncSamples.length, (index) => syncSamples[index] ?? 0, sample);
    return syncSamples[count - 1];
  }

  public firstSyncSample(): number | undefined {
    const { syncSamples } = this.parts;
    if (syncSamples) return syncSamples[0];
    return this.sampleCount > 0 ? 0 : undefined;
  }

  public timestampsInPresentationOrder(): Seconds[] {
    return this.presentationOrder.map((sample) => seconds(this.parts.timestamps[sample] ?? 0));
  }

  private ensureSample(sample: number): void {
    ensureIndexInRange(sample, this.sampleCount, `sample of track ${this.trackId}`);
  }
}

function isAscendingWithin(samples: readonly number[], count: number): boolean {
  return samples.every(
    (sample, index) =>
      Number.isSafeInteger(sample) &&
      sample >= 0 &&
      sample < count &&
      sample > (samples[index - 1] ?? -1),
  );
}
