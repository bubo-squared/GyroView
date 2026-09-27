import {
  DecodePipeline,
  type DecodePipelineOptions,
  type DecodePipelineReport,
} from './DecodePipeline';
import { FramePairQueue } from './FramePairQueue';
import type { VideoTrackReader } from '../../ports/Demuxer';
import type { FramePair } from '../../ports/FramePair';
import type { VideoDecoderPort } from '../../ports/VideoDecoderPort';
import { seconds, type Seconds } from '../../shared/units/time';

/**
 * Pairs queued before the clock (re)starts, so playback does not stall on its first frames.
 */
const PRIMING_PAIRS = 2;
/**
 * A shown frame this far behind the clock, with nothing decoded to follow it, means the decoders
 * have fallen behind: several frames at any frame rate, well beyond jitter.
 */
const STARVATION_LAG_SECONDS = 0.25;

export interface DecodeRunParts<Handle> {
  /**
   * One reader per frame source, in the order of `lensFrameOrder`.
   */
  readonly frameSources: readonly VideoTrackReader[];
  readonly decoderPort: VideoDecoderPort<Handle>;
  readonly pipeline: DecodePipelineOptions;
  /**
   * Decoded pairs kept ahead of the playhead.
   */
  readonly queueCapacity: number;
}

/**
 * What a run tells the one who started it, until it is aborted.
 */
export interface DecodeRunListener {
  /**
   * A pair arrived or the run reached its end: what a waiting start may be waiting for.
   */
  onProgress(): void;
  onFailure(error: unknown): void;
}

/**
 * One decode of every frame source from a time into a queue of its own: the pipeline, the pairs
 * it delivered and whether it reached the end, which live and go together. Once aborted it drops
 * what arrives late and reports nothing, so a run a seek replaced never speaks for its successor.
 */
export class DecodeRun<Handle> {
  private readonly queue: FramePairQueue<Handle>;
  private readonly pipeline: DecodePipeline<Handle>;
  private readonly primingPairs: number;
  private isAborted = false;
  private hasReachedEnd = false;
  private hasHandedOutPair = false;

  private constructor(
    parts: DecodeRunParts<Handle>,
    private readonly listener: DecodeRunListener,
  ) {
    this.primingPairs = Math.min(PRIMING_PAIRS, parts.queueCapacity);
    this.queue = new FramePairQueue<Handle>(parts.queueCapacity, () => {
      if (!this.isAborted) listener.onProgress();
    });
    this.pipeline = new DecodePipeline<Handle>(
      parts.frameSources,
      parts.decoderPort,
      parts.pipeline,
    );
  }

  public static start<Handle>(
    parts: DecodeRunParts<Handle>,
    from: Seconds,
    listener: DecodeRunListener,
  ): DecodeRun<Handle> {
    const run = new DecodeRun(parts, listener);
    void run.follow(run.pipeline.run(from, run.queue));
    return run;
  }

  /**
   * Everything has been decoded and every pair handed out.
   */
  public get isDrained(): boolean {
    return this.hasReachedEnd && this.queue.length === 0;
  }

  /**
   * Enough frames are decoded to start moving: a couple queued, or the run is over and what is
   * left is already there.
   */
  public get isPrimed(): boolean {
    return this.hasReachedEnd || this.queue.length >= this.primingPairs;
  }

  /**
   * Nothing is queued, the run is not over, and the frame on screen (shown for `shownAt`, if any)
   * is well behind the clock: the decoders cannot keep up, even when each tick still finds a
   * pair to show.
   */
  public isStarvedAt(now: Seconds, shownAt: Seconds | undefined): boolean {
    const isWaitingOnDecoders = this.queue.length === 0 && !this.hasReachedEnd;
    const lag = now - (shownAt ?? -Infinity);
    return isWaitingOnDecoders && lag > STARVATION_LAG_SECONDS;
  }

  /**
   * The latest pair due at `time`. Until the run has handed one out, its first pair is due at
   * once: on tracks whose first frame comes after `time`, that frame is the picture there.
   */
  public takePairAt(time: Seconds): FramePair<Handle> | undefined {
    const head = this.queue.peekTimestamp();
    const isFirst = !this.hasHandedOutPair && head !== undefined;
    const pair = this.queue.takePairAt(isFirst ? seconds(Math.max(time, head)) : time);
    if (pair) this.hasHandedOutPair = true;
    return pair;
  }

  public abort(): void {
    this.isAborted = true;
    this.pipeline.abort();
    this.queue.close();
  }

  private async follow(report: Promise<DecodePipelineReport>): Promise<void> {
    try {
      const { hasReachedEnd } = await report;
      if (this.isAborted) return;
      this.hasReachedEnd = hasReachedEnd;
      this.listener.onProgress();
    } catch (error) {
      if (!this.isAborted) this.listener.onFailure(error);
    }
  }
}
