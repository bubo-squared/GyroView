import { ThreeFrameRenderer } from '@gyroview/adapter-three';
import {
  DecodePipeline,
  DEFAULT_PICTURE_QUALITY,
  DEFAULT_STABILIZATION_MODE,
  Deferred,
  ensureInvariant,
  FramePairQueue,
  GyroViewError,
  GainMatchingFrameSink,
  messageOf,
  referenceLensOf,
  RenditionSpan,
  renditionSizeOf,
  seconds,
  stabilizerFor,
  UPRIGHT_MOUNTING,
  type FramePair,
  type PictureQuality,
  type SpanRequest,
  type StabilizationMode,
  type VideoDecoderPort,
  type ViewportSize,
} from '@gyroview/core';

import {
  DECODE_PIPELINE_OPTIONS,
  PAIR_QUEUE_CAPACITY,
  sinkOver,
  stitchingSetupOf,
} from './buildPipeline';
import { Disposables } from './Disposables';
import type { OpenedRecording } from './OpenedRecording';

/**
 * What a rendition draws: the equirectangular picture `width` pixels across, of the span asked
 * for, with the picture settings the player opens with unless given.
 */
export interface RenditionRequest extends SpanRequest {
  readonly width: number;
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
   * from the span's start; the consumer closes each. Iterated once; leaving the loop early, or
   * {@link dispose}, stops the decoding.
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
 * Renders the opened recording frame by frame. The span and size are checked before anything is
 * built, so a request that holds no picture decodes nothing.
 */
export function renditionOf(parts: RenditionParts, request: RenditionRequest): RenditionFrames {
  const span = RenditionSpan.of(request, seconds(parts.opened.duration));
  const size = renditionSizeOf(request.width);
  return new RenditionRun(parts, request, { span, size });
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
    try {
      this.renderer = this.equirectangularRenderer(request.quality ?? DEFAULT_PICTURE_QUALITY);
      this.gainMatching = this.sinksOver(request);
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

  private equirectangularRenderer(quality: PictureQuality): ThreeFrameRenderer {
    const renderer = ThreeFrameRenderer.create(this.canvas, stitchingSetupOf(this.parts.opened));
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
   * Gain matching in front of the stabilizing sink in front of the renderer, as the player
   * composes them.
   */
  private sinksOver(request: RenditionRequest): GainMatchingFrameSink<VideoFrame> {
    const { opened } = this.parts;
    const { sink, stabilizing } = sinkOver(this.renderer, opened);
    stabilizing?.setStabilizer(stabilizerFor(request.stabilization ?? DEFAULT_STABILIZATION_MODE));
    const mounting = opened.motion?.mounting ?? UPRIGHT_MOUNTING;
    const lenses = stitchingSetupOf(opened).lenses;
    const matching = new GainMatchingFrameSink(
      sink,
      this.renderer,
      referenceLensOf(lenses, mounting),
    );
    this.disposables.add(() => {
      matching.dispose();
    });
    if (request.gainMatching ?? true) matching.enable();
    return matching;
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
      this.renderFailure ??= new GyroViewError(
        'render-unavailable',
        'the WebGL context was lost while rendering',
      );
      this.pipeline.abort();
      this.wake.resolve();
    };
    this.canvas.addEventListener('webglcontextlost', onLost);
    this.disposables.add(() => {
      this.canvas.removeEventListener('webglcontextlost', onLost);
    });
  }

  /**
   * Draws the pair and takes the picture, then waits for the gains measured on it, so they show
   * from the next frame on whatever the GPU's pace.
   */
  private async render(pair: FramePair<VideoFrame>): Promise<VideoFrame> {
    let picture: VideoFrame;
    try {
      this.gainMatching.present({ pair, mediaTime: pair.timestamp });
      picture = new VideoFrame(this.canvas, {
        timestamp: this.span.timestampOf(pair.timestamp),
        ...durationOf(pair),
      });
    } finally {
      closePair(pair);
    }
    await this.gainMatching.settled();
    if (this.renderFailure === undefined) return picture;
    picture.close();
    throw this.renderFailure;
  }

  /**
   * The next pair in decode order, waiting for the pipeline when the queue is empty; undefined
   * once the run has ended with every pair taken, or the rendition was disposed.
   */
  private async nextPair(): Promise<FramePair<VideoFrame> | undefined> {
    for (;;) {
      if (this.renderFailure !== undefined) throw this.renderFailure;
      const head = this.queue.peekTimestamp();
      if (head !== undefined) return this.queue.takePairAt(head);
      if (this.isDisposed) return undefined;
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
