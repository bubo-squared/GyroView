/* eslint-disable @typescript-eslint/unbound-method -- each original is called back with the receiver it was given */
import type { DecodedRecord, TickRecord } from './pacingSummary';

/**
 * Records where a playing recording's frames go, from outside the player, so that the pipeline
 * measured is the one a page runs: each animation frame's tick, the lens frames it uploaded and
 * the mipmaps it built, when the GPU had done its commands, and when each frame left its
 * decoder. It wraps the page's `requestAnimationFrame`, `VideoDecoder` and WebGL calls for one
 * test, and `restore` puts them back.
 */
export interface PipelineRecorder {
  readonly ticks: readonly TickRecord[];
  readonly decoded: readonly DecodedRecord[];
  restore(): void;
}

/**
 * How often the GPU fences are polled: the resolution of `gpuDoneAt`.
 */
const FENCE_POLL_MS = 2;

/**
 * The tick under way, which the WebGL wrappers add their calls to.
 */
interface TickCursor {
  current: TickRecord | undefined;
}

export function recordPipeline(
  audio: HTMLMediaElement,
  canvas: HTMLCanvasElement,
): PipelineRecorder {
  const ticks: TickRecord[] = [];
  const decoded: DecodedRecord[] = [];
  const cursor: TickCursor = { current: undefined };
  const restores = [
    recordTicks({ audio, canvas, cursor, ticks }),
    recordUploads(cursor),
    recordDecodes(decoded),
  ];
  return {
    ticks,
    decoded,
    restore: (): void => {
      for (const restore of restores) restore();
    },
  };
}

interface TickParts {
  readonly audio: HTMLMediaElement;
  readonly canvas: HTMLCanvasElement;
  readonly cursor: TickCursor;
  readonly ticks: TickRecord[];
}

function recordTicks(parts: TickParts): () => void {
  const fences = gpuFences(parts.canvas);
  const original = globalThis.requestAnimationFrame;
  const recording: typeof requestAnimationFrame = (callback) =>
    original((frameTime) => {
      const tick = tickAt(frameTime, parts.audio);
      parts.cursor.current = tick;
      callback(frameTime);
      tick.end = performance.now();
      parts.cursor.current = undefined;
      parts.ticks.push(tick);
      fences.fence(tick);
    });
  replaceGlobal('requestAnimationFrame', recording);
  return () => {
    replaceGlobal('requestAnimationFrame', original);
    fences.stop();
  };
}

function tickAt(frameTime: number, audio: HTMLMediaElement): TickRecord {
  return {
    frameTime,
    start: performance.now(),
    end: 0,
    clock: audio.currentTime,
    uploads: [],
    mipmapMs: 0,
    gpuDoneAt: undefined,
  };
}

interface GpuFences {
  fence(tick: TickRecord): void;
  stop(): void;
}

/**
 * A fence after each tick's commands, polled until the GPU has passed it.
 */
function gpuFences(canvas: HTMLCanvasElement): GpuFences {
  const pending: { readonly tick: TickRecord; readonly sync: WebGLSync }[] = [];
  const poll = (): void => {
    const gl = canvas.getContext('webgl2');
    for (let first = pending[0]; gl && first; first = pending[0]) {
      const status = gl.clientWaitSync(first.sync, 0, 0);
      if (status === gl.TIMEOUT_EXPIRED || status === gl.WAIT_FAILED) return;
      first.tick.gpuDoneAt = performance.now();
      gl.deleteSync(first.sync);
      pending.shift();
    }
  };
  const poller = setInterval(poll, FENCE_POLL_MS);
  return {
    fence: (tick): void => {
      const gl = canvas.getContext('webgl2');
      const sync = gl?.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      if (!gl || !sync) return;
      gl.flush();
      pending.push({ tick, sync });
    },
    stop: (): void => {
      clearInterval(poller);
    },
  };
}

function recordUploads(cursor: TickCursor): () => void {
  const prototype = WebGL2RenderingContext.prototype;
  const { texImage2D, generateMipmap } = prototype;
  prototype.texImage2D = function timedUpload(
    this: WebGL2RenderingContext,
    ...parameters: unknown[]
  ): void {
    const frame = parameters.find((parameter) => parameter instanceof VideoFrame);
    const start = performance.now();
    Reflect.apply(texImage2D, this, parameters);
    if (frame && cursor.current) {
      cursor.current.uploads.push({ timestamp: frame.timestamp, ms: performance.now() - start });
    }
  };
  prototype.generateMipmap = function timedMipmap(this: WebGL2RenderingContext, target): void {
    const start = performance.now();
    generateMipmap.call(this, target);
    if (cursor.current) cursor.current.mipmapMs += performance.now() - start;
  };
  return () => {
    prototype.texImage2D = texImage2D;
    prototype.generateMipmap = generateMipmap;
  };
}

function recordDecodes(decoded: DecodedRecord[]): () => void {
  const original = VideoDecoder;
  class RecordingDecoder extends original {
    public constructor(init: VideoDecoderInit) {
      super({
        ...init,
        output: (frame): void => {
          decoded.push({ at: performance.now(), timestamp: frame.timestamp });
          init.output(frame);
        },
      });
    }
  }
  replaceGlobal('VideoDecoder', RecordingDecoder);
  return () => {
    replaceGlobal('VideoDecoder', original);
  };
}

/**
 * The page's own global, replaced for the test that records it.
 */
function replaceGlobal<Name extends 'requestAnimationFrame' | 'VideoDecoder'>(
  name: Name,
  value: (typeof globalThis)[Name],
): void {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}
