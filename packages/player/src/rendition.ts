import {
  GyroViewError,
  renditionSizeOf,
  seconds,
  type PictureQuality,
  type StabilizationMode,
  type ViewMode,
  type ViewportSize,
} from '@gyroview/core';

import { browserPorts, type BrowserPortsOptions } from './composition/browserPorts';
import { openRecording } from './composition/openRecording';
import type { OpenedRecording } from './composition/OpenedRecording';
import { renditionOf, type RenditionFrames } from './composition/renditionFrames';
import type { PlayerMetadata } from './PlayerMetadata';
import type { PlayerSource } from './PlayerSource';

/**
 * What a rendition draws, named as the player's view modes are: the equirectangular view for
 * now. A flat view can join it as another mode, with options of its own (ADR 0045).
 */
export interface RenditionView {
  readonly mode: Extract<ViewMode, 'equirectangular'>;
  /**
   * How many pixels across the picture is; half as many down. A multiple of four, so that both
   * sides are even as encoders take them.
   */
  readonly width: number;
}

const EQUIRECTANGULAR: RenditionView['mode'] = 'equirectangular';

export interface RenditionOptions extends Pick<BrowserPortsOptions, 'http'> {
  readonly view: RenditionView;
  /**
   * Where the rendition starts, in the recording's seconds; its start by default.
   */
  readonly from?: number;
  /**
   * Where it ends, not included; the recording's end by default, and at most.
   */
  readonly to?: number;
  /**
   * The player's own settings by default: its default stabilization, exposure matched along
   * the seam, its default quality.
   */
  readonly stabilization?: StabilizationMode;
  readonly gainMatching?: boolean;
  readonly quality?: PictureQuality;
  /**
   * Stops the opening, or the rendering: `frames()` then rejects with the signal's reason, so an
   * encoder does not take a cut-short rendition for a finished one.
   */
  readonly signal?: AbortSignal;
}

/**
 * A recording rendered frame by frame into stitched, stabilized equirectangular pictures, for an
 * encoder to take (ADR 0045). Unlike the player, it follows no clock: it draws every frame of the
 * span exactly once, in order, when the consumer asks for the next, so a slow encoder loses
 * nothing and a fast one waits only for the decoder. Works in a dedicated worker.
 *
 * @example
 * ```ts
 * const rendition = await openRendition(
 *   { main: { blob: file, name: file.name } },
 *   { view: { mode: 'equirectangular', width: 3840 } },
 * );
 * try {
 *   for await (const frame of rendition.frames()) {
 *     try {
 *       await videoSource.add(new VideoSample(frame)); // a Mediabunny VideoSampleSource
 *     } finally {
 *       frame.close();
 *     }
 *   }
 * } finally {
 *   rendition.dispose();
 * }
 * ```
 */
export interface Rendition {
  readonly metadata: PlayerMetadata;
  readonly width: number;
  readonly height: number;
  /**
   * Of the span rendered, in seconds.
   */
  readonly duration: number;
  /**
   * What the recording lacks, or has damaged, that the rendition works around, as the player's
   * `recording-degraded` warnings say: a damaged gyro record renders unstabilized.
   */
  readonly warnings: readonly string[];
  /**
   * One `VideoFrame` per frame of the span, its timestamp in microseconds from the span's start,
   * which the consumer closes. Iterated once, a second call throwing `invalid-argument`; ending
   * the loop, leaving it early or a failure stops the rendering and lets go of the recording.
   * Stopped part way, it rejects: with the signal's reason when the signal is aborted, with an
   * `AbortError` when the rendition is disposed, and with `render-unavailable` when the WebGL
   * context is lost.
   */
  frames(): AsyncIterable<VideoFrame>;
  /**
   * Stops the rendering and lets go of the recording.
   */
  dispose(): void;
}

/**
 * Opens a recording, as the player would, to render it frame by frame (see {@link Rendition}).
 * Rejects with the `GyroViewError` a load would meet, with `invalid-argument` for a view it does
 * not draw, or a width or span that holds no picture, and with `render-unavailable` when the GPU
 * cannot draw a picture of that size.
 */
export async function openRendition(
  source: PlayerSource,
  options: RenditionOptions,
): Promise<Rendition> {
  const request = requestOf(options);
  const signal = options.signal ?? new AbortController().signal;
  const ports = browserPorts({ ...(options.http && { http: options.http }) });
  const opened = await openRecording(source, ports, signal);
  try {
    signal.throwIfAborted();
    const frames = renditionOf({ opened, decoderPort: ports.decoderPort }, request);
    return renditionOver(opened, frames, signal);
  } catch (error) {
    opened.dispose();
    throw error;
  }
}

function requestOf(options: RenditionOptions): Parameters<typeof renditionOf>[1] {
  const { view, from, to, stabilization, gainMatching, quality } = options;
  return {
    size: equirectangularSizeOf(view),
    ...(from !== undefined && { from: seconds(from) }),
    ...(to !== undefined && { to: seconds(to) }),
    ...(stabilization && { stabilization }),
    ...(gainMatching !== undefined && { gainMatching }),
    ...(quality && { quality }),
  };
}

/**
 * Refuses another mode, or a width encoders cannot take, before anything is downloaded: the types
 * stop another mode in TypeScript, but not in a page's plain JavaScript.
 */
function equirectangularSizeOf(view: RenditionView): ViewportSize {
  const mode: string = view.mode;
  if (mode !== EQUIRECTANGULAR) {
    throw new GyroViewError('invalid-argument', `a rendition cannot draw the ${mode} view`);
  }
  return renditionSizeOf(view.width);
}

function renditionOver(
  opened: OpenedRecording,
  frames: RenditionFrames,
  signal: AbortSignal,
): Rendition {
  const dispose = (): void => {
    signal.removeEventListener('abort', dispose);
    frames.dispose();
    opened.dispose();
  };
  signal.addEventListener('abort', dispose, { once: true });
  let isIterated = false;
  return {
    metadata: opened.metadata,
    ...frames.size,
    duration: frames.span.duration,
    warnings: opened.warnings,
    frames: (): AsyncIterable<VideoFrame> => {
      // Refused before the generator starts, so that the loop already running goes on.
      if (isIterated) {
        throw new GyroViewError('invalid-argument', 'a rendition yields its frames once');
      }
      isIterated = true;
      return framesUntilAborted(frames, signal, dispose);
    },
    dispose,
  };
}

/**
 * The rendition's frames, rejecting with the signal's reason when the signal stopped them part
 * way, and letting go of everything however the loop ends.
 */
async function* framesUntilAborted(
  frames: RenditionFrames,
  signal: AbortSignal,
  dispose: () => void,
): AsyncGenerator<VideoFrame, void, undefined> {
  try {
    yield* frames.frames();
  } catch (error) {
    signal.throwIfAborted();
    throw error;
  } finally {
    dispose();
  }
}
