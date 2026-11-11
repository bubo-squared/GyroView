import { DRAW_WITH_NEXT_PAIR, ThreeFrameRenderer } from '@gyroview/adapter-three';
import {
  DecodePipeline,
  DEFAULT_PICTURE_QUALITY,
  DEFAULT_STABILIZATION_MODE,
  Deferred,
  ensureInvariant,
  FramePairQueue,
  GyroViewError,
  IS_GAIN_MATCHED_BY_DEFAULT,
  messageOf,
  RenditionSpan,
  seconds,
  stabilizerFor,
  type FramePair,
  type GainMatchingFrameSink,
  type PictureQuality,
  type SpanRequest,
  type StabilizationMode,
  type StitchingSetup,
  type VideoDecoderPort,
  type ViewportSize,
} from '@gyroview/core';

import {
  DECODE_PIPELINE_OPTIONS,
  PAIR_QUEUE_CAPACITY,
  sinksOver,
  stitchingSetupOf,
} from './buildPipeline';
import { Disposables } from './Disposables';
import type { OpenedRecording } from './OpenedRecording';

/**
 * What a rendition draws: the equirectangular picture of the size asked for, checked as
 * `renditionSizeOf` checks it, of the span asked for, with the picture settings the player opens
 * with unless given.
 */
export interface RenditionRequest extends SpanRequest {
  readonly size: ViewportSize;
  readonly stabilization?: StabilizationMode;
  readonly gainMatching?: boolean;
  readonly quality?: PictureQuality;
}

export interface RenditionParts {
  readonly opened: OpenedRecording;
  readonly decoderPort: VideoDecoderPort<VideoFrame>;
}

/**
 * A recording rendered frame by frame for an encoder (ADR 0045): every frame of the span exactly
 * once, in order, as fast as the consumer takes them and no faster.
 */
export interface RenditionFrames {
  readonly span: RenditionSpan;
  readonly size: ViewportSize;
  /**
   * The stitched pictures, one `VideoFrame` per frame of the recording, timed in microseconds
   * from the span's start; the consumer closes each. Iterated once; leaving the loop early stops
   * the decoding, and {@link dispose} or a lost context part way rejects it, so a cut-short run
   * never reads as finished.
   */
  frames(): AsyncGenerator<VideoFrame, void, undefined>;
  /**
   * Stops decoding and lets go of the renderer; the opened recording stays its owner's.
   */
  dispose(): void;
}

/**
 * How the decode run ended, once it has: every pair it decoded is in the queue by then.
 */
interface RunOutcome {
  readonly failure: Error | undefined;
}

/**
 * Renders the opened recording frame by frame. The span is checked before anything is built, so a
 * span that holds no picture decodes nothing.
 */
export function renditionOf(parts: RenditionParts, request: RenditionRequest): RenditionFrames {
  const span = RenditionSpan.of(request, seconds(parts.opened.duration));
  return new RenditionRun(parts, request, { span, size: request.size });
}

class RenditionRun implements RenditionFrames {
  public readonly span: RenditionSpan;
  public readonly size: ViewportSize;
  private readonly canvas: OffscreenCanvas;
  private readonly disposables = new Disposables();
  private readonly renderer: ThreeFrameRenderer;
  private readonly gainMatching: GainMatchingFrameSink<VideoFrame>;
  private readonly queue: FramePairQueue<VideoFrame>;
  private readonly pipeline: DecodePipeline<VideoFrame>;
  private wake = new Deferred<void>();
  private outcome: RunOutcome | undefined;
  /**
   * Why the rendering cannot go on although decoding could: the WebGL context was lost, and the
   * frames drawn from then on would be blank.
   */
  private renderFailure: Error | undefined;
  private hasStarted = false;
  private isDisposed = false;

  public constructor(
    private readonly parts: RenditionParts,
    request: RenditionRequest,
    shape: Pick<RenditionFrames, 'span' | 'size'>,
  ) {
    this.span = shape.span;
    this.size = shape.size;
    this.canvas = new OffscreenCanvas(this.size.width, this.size.height);
    this.disposables.add(() => {
      releaseContextOf(this.canvas);
    });
    try {
      const setup = stitchingSetupOf(parts.opened);
      this.renderer = this.equirectangularRenderer(
        setup,
        request.quality ?? DEFAULT_PICTURE_QUALITY,
      );
      this.gainMatching = this.gainMatchingOver(setup, request);
    } catch (error) {
      this.disposables.disposeAll();
      throw error;
    }
    this.listenForContextLoss();
    this.queue = new FramePairQueue(PAIR_QUEUE_CAPACITY, () => {
      this.wake.resolve();
    });
    const { frameSources } = parts.opened;
    this.pipeline = new DecodePipeline(frameSources, parts.decoderPort, DECODE_PIPELINE_OPTIONS);
  }

  /**
   * Frames that stop part way reject, so that an encoder never takes a cut-short run for a
   * finished one: an abort as `AbortSignal` reports one, a lost context as `render-unavailable`.
   */
  private get stopReason(): Error | undefined {
    if (this.renderFailure !== undefined) return this.renderFailure;
    return this.isDisposed
      ? new DOMException('the rendition was disposed before its last frame', 'AbortError')
      : undefined;
  }

  public async *frames(): AsyncGenerator<VideoFrame, void, undefined> {
    ensureInvariant(!this.hasStarted, 'a rendition renders its frames once');
    this.hasStarted = true;
    void this.decode();
    try {
      for (let pair = await this.nextPair(); pair; pair = await this.nextPair()) {
        const { timestamp } = pair;
        if (this.span.hasEndedAt(timestamp, DECODE_PIPELINE_OPTIONS.pairTolerance)) {
          closePair(pair);
          return;
        }
        if (this.span.includes(timestamp, DECODE_PIPELINE_OPTIONS.pairTolerance)) {
          yield await this.render(pair);
        } else closePair(pair);
      }
    } finally {
      this.dispose();
    }
  }

  public dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.pipeline.abort();
    this.queue.close();
    this.disposables.disposeAll();
    this.wake.resolve();
  }

  /**
   * The renderer draws only the pairs presented to it. The picture is taken right after each pair,
   * which is closed then, so new gains drawn on their own would be a picture nobody takes; and a
   * lost context fails the run, so a restored one has nothing to draw.
   */
  private equirectangularRenderer(
    setup: StitchingSetup,
    quality: PictureQuality,
  ): ThreeFrameRenderer {
    const renderer = ThreeFrameRenderer.create(this.canvas, setup, {
      drawSchedule: DRAW_WITH_NEXT_PAIR,
    });
    this.disposables.add(() => {
      renderer.dispose();
    });
    renderer.resize(this.size);
    this.ensureDrawingBufferHolds();
    renderer.setViewMode('equirectangular');
    renderer.setQuality(quality);
    return renderer;
  }

  /**
   * The sinks the player presents through, with the settings asked for: the front of the chain.
   */
  private gainMatchingOver(
    setup: StitchingSetup,
    request: RenditionRequest,
  ): GainMatchingFrameSink<VideoFrame> {
    const { stabilizing, gainMatching } = sinksOver(this.renderer, this.parts.opened, setup);
    this.disposables.add(() => {
      gainMatching.dispose();
    });
    stabilizing?.setStabilizer(stabilizerFor(request.stabilization ?? DEFAULT_STABILIZATION_MODE));
    if (request.gainMatching ?? IS_GAIN_MATCHED_BY_DEFAULT) gainMatching.enable();
    return gainMatching;
  }

  /**
   * WebGL may give a drawing buffer smaller than asked, as an 8K one on a phone, and the picture
   * would then be cropped without a word; such a size is refused instead.
   */
  private ensureDrawingBufferHolds(): void {
    const gl = this.canvas.getContext('webgl2');
    ensureInvariant(gl !== null, 'the renderer holds the WebGL2 context of the canvas');
    const { drawingBufferWidth: width, drawingBufferHeight: height } = gl;
    if (width >= this.size.width && height >= this.size.height) return;
    throw new GyroViewError(
      'render-unavailable',
      `this GPU draws at most ${width} x ${height} pixels; the rendition is ${this.size.width} x ${this.size.height}`,
    );
  }

  /**
   * A player redraws after a GPU reset, but a written file cannot be mended: a lost context fails
   * the rendition.
   */
  private listenForContextLoss(): void {
    const onLost = (): void => {
      this.failOnLostContext();
    };
    this.canvas.addEventListener('webglcontextlost', onLost);
    this.disposables.add(() => {
      this.canvas.removeEventListener('webglcontextlost', onLost);
    });
  }

  private failOnLostContext(): void {
    this.renderFailure ??= new GyroViewError(
      'render-unavailable',
      'the WebGL context was lost while rendering',
    );
    this.pipeline.abort();
    this.wake.resolve();
  }

  /**
   * WebGL marks the context lost at once but fires `webglcontextlost` a task later, and a picture
   * taken in between is blank.
   */
  private noticeLostContext(): void {
    if (this.isDisposed) return;
    if (this.canvas.getContext('webgl2')?.isContextLost() ?? true) this.failOnLostContext();
  }

  /**
   * Draws the pair and takes the picture, then waits for the gains measured on it, so they show
   * from the next frame on whatever the GPU's pace. A picture taken as the run stopped is closed.
   */
  private async render(pair: FramePair<VideoFrame>): Promise<VideoFrame> {
    const picture = this.pictureOf(pair);
    await this.gainMatching.settled();
    this.noticeLostContext();
    const stop = this.stopReason;
    if (stop === undefined) return picture;
    picture.close();
    throw stop;
  }

  private pictureOf(pair: FramePair<VideoFrame>): VideoFrame {
    try {
      this.gainMatching.present({ pair, mediaTime: pair.timestamp });
      return new VideoFrame(this.canvas, {
        timestamp: this.span.timestampOf(pair.timestamp),
        ...durationOf(pair),
      });
    } catch (error) {
      this.noticeLostContext();
      throw this.renderFailure ?? error;
    } finally {
      closePair(pair);
    }
  }

  /**
   * The next pair in decode order, waiting for the pipeline when the queue is empty; undefined
   * once the run has ended with every pair taken.
   */
  private async nextPair(): Promise<FramePair<VideoFrame> | undefined> {
    for (;;) {
      const stop = this.stopReason;
      if (stop !== undefined) throw stop;
      const head = this.queue.peekTimestamp();
      if (head !== undefined) return this.queue.takePairAt(head);
      if (this.outcome) {
        if (this.outcome.failure !== undefined) throw this.outcome.failure;
        return undefined;
      }
      this.wake = new Deferred<void>();
      await this.wake.promise;
    }
  }

  private async decode(): Promise<void> {
    this.parts.opened.readAhead();
    try {
      await this.pipeline.run(this.span.from, this.queue);
      this.outcome = { failure: undefined };
    } catch (error) {
      this.outcome = { failure: error instanceof Error ? error : new Error(messageOf(error)) };
    } finally {
      this.wake.resolve();
    }
  }
}

/**
 * The frame's duration as its decoder gave it, which the camera's constant rate makes every
 * frame's; none when the decoder did not say.
 */
function durationOf(pair: FramePair<VideoFrame>): { duration?: number } {
  const duration = pair.frames[0]?.handle.duration;
  return duration === null || duration === undefined ? {} : { duration };
}

function closePair(pair: FramePair<VideoFrame>): void {
  for (const frame of pair.frames) frame.close();
}

/**
 * Gives the context and its drawing buffer back at once rather than when the canvas is
 * collected: a page that renders one clip after another would otherwise pile contexts up until
 * the browser takes the oldest away, its own player's perhaps (as `PlayerCanvas.release` does).
 */
function releaseContextOf(canvas: OffscreenCanvas): void {
  canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();
}
