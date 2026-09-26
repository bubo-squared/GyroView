import {
  DecodePipeline,
  type DecodePipelineOptions,
  type DecodePipelineReport,
} from './DecodePipeline';
import { FramePairQueue } from './FramePairQueue';
import type { VideoTrackReader } from '../../ports/Demuxer';
import type { FramePair } from '../../ports/FramePair';
import type { VideoDecoderPort } from '../../ports/VideoDecoderPort';
import type { Seconds } from '../../shared/units/time';

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
  private isAborted = false;
  private hasReachedEndValue = false;

  private constructor(
    parts: DecodeRunParts<Handle>,
    private readonly listener: DecodeRunListener,
  ) {
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
   * Everything to be decoded has been, and what is left is in the queue.
   */
  public get hasReachedEnd(): boolean {
    return this.hasReachedEndValue;
  }

  public get queuedPairs(): number {
    return this.queue.length;
  }

  public takePairAt(time: Seconds): FramePair<Handle> | undefined {
    return this.queue.takePairAt(time);
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
      this.hasReachedEndValue = hasReachedEnd;
      this.listener.onProgress();
    } catch (error) {
      if (!this.isAborted) this.listener.onFailure(error);
    }
  }
}
