import {
  degrees,
  GyroViewError,
  seconds,
  type PictureRenderer,
  type PlaybackSession,
  type VideoDecoderPort,
} from '@gyroview/core';
import { afterEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import { Player } from './Player';
import type { PlayerStatus, PlayerWarning } from './PlayerEvents';
import type { PlayerMetadata } from '../PlayerMetadata';
import { browserPorts } from '../composition/browserPorts';
import { buildPipeline } from '../composition/buildPipeline';
import type { PipelineFactory, RecordingPorts, SourceOpener } from '../composition/ports';
import type { PlayerSource } from '../PlayerSource';
import { X5_RECORDING_URL, X5_RECORDING_WITH_AUDIO_URL } from '../test/recordings';
import { settle, waitFor } from '../test/waiting';

const CANVAS_WIDTH = 128;
const CANVAS_HEIGHT = 64;
function sourceOf(url: string): PlayerSource {
  return { main: { url }, second: undefined };
}

interface Harness {
  readonly player: Player;
  readonly canvas: HTMLCanvasElement;
  readonly audio: HTMLAudioElement;
  readonly statuses: PlayerStatus[];
  readonly events: string[];
  readonly frames: number[];
  readonly warnings: PlayerWarning[];
  readonly errors: GyroViewError[];
}

function harness(pipelines: PipelineFactory, ports: RecordingPorts = browserPorts()): Harness {
  const canvas = document.createElement('canvas');
  canvas.style.width = `${CANVAS_WIDTH}px`;
  canvas.style.height = `${CANVAS_HEIGHT}px`;
  const audio = document.createElement('audio');
  audio.muted = true;
  document.body.append(canvas, audio);
  const player = new Player({ host: { canvas, audio }, ports, pipelines });
  const statuses: PlayerStatus[] = [];
  const events: string[] = [];
  const frames: number[] = [];
  const warnings: PlayerWarning[] = [];
  const errors: GyroViewError[] = [];
  player.events.on('statuschange', (status) => {
    statuses.push(status);
  });
  for (const name of [
    'play',
    'playing',
    'waiting',
    'pause',
    'ended',
    'seeking',
    'seeked',
    'ready',
  ] as const) {
    player.events.on(name, () => {
      events.push(name);
    });
  }
  player.events.on('frame', (time) => {
    frames.push(time);
  });
  player.events.on('warning', (warning) => {
    warnings.push(warning);
  });
  player.events.on('error', (error) => {
    errors.push(error);
  });
  return { player, canvas, audio, statuses, events, frames, warnings, errors };
}

/**
 * The browser's ports, remembering the signal each byte source was opened with.
 */
function capturingSignals(): {
  readonly ports: RecordingPorts;
  readonly signals: AbortSignal[];
} {
  const browser = browserPorts();
  const signals: AbortSignal[] = [];
  const sources: SourceOpener = {
    open: (input, signal) => {
      signals.push(signal);
      return browser.sources.open(input, signal);
    },
  };
  return { ports: { ...browser, sources }, signals };
}

/**
 * The browser's decoders, the latest of which a test can fail as a GPU reset fails it, once the
 * decode run under way has made it.
 */
function breakableDecoders(): {
  readonly ports: RecordingPorts;
  readonly breakDecoder: () => Promise<void>;
} {
  const browser = browserPorts();
  const failures: ((error: Error) => void)[] = [];
  const decoderPort: VideoDecoderPort<VideoFrame> = {
    isSupported: (configuration) => browser.decoderPort.isSupported(configuration),
    create: (configuration, callbacks) => {
      failures.push(callbacks.onError);
      return browser.decoderPort.create(configuration, callbacks);
    },
  };
  return {
    ports: { ...browser, decoderPort },
    breakDecoder: async (): Promise<void> => {
      // The load's probe made its decoders; the preloading run makes its own after them.
      const madeByTheLoad = failures.length;
      await waitFor(() => failures.length > madeByTheLoad, 'the decode run');
      failures.at(-1)?.(new Error('the GPU reset'));
    },
  };
}

/**
 * The events without what decode timing decides: every `waiting`, and the `playing` that ends a
 * stall once playback was under way. A `playing` repeated without a stall between stays.
 */
function withoutStalls(events: readonly string[]): string[] {
  return events.filter((name, index) => {
    const isStallEnd =
      name === 'playing' &&
      events[index - 1] === 'waiting' &&
      events.slice(0, index).includes('playing');
    return name !== 'waiting' && !isStallEnd;
  });
}
describe('Player over the synthetic X5 recording', () => {
  const harnesses: Harness[] = [];

  function open(pipelines: PipelineFactory = buildPipeline, ports?: RecordingPorts): Harness {
    const created = harness(pipelines, ports);
    harnesses.push(created);
    return created;
  }

  afterEach(() => {
    for (const { player, canvas } of harnesses.splice(0)) {
      player.dispose();
      canvas.remove();
    }
  });

  it('loads, reports metadata and warnings, and sizes the canvas to its layout box', async () => {
    const { player, canvas, statuses, warnings } = open();

    await player.load(sourceOf(X5_RECORDING_URL));

    expect(statuses).toEqual(['loading', 'ready']);
    expect(player.metadata).toMatchObject({
      model: 'Insta360 X5',
      layout: 'multi-track',
      frameTimeSource: 'track-timestamps',
      hasGyro: true,
      hasAudio: false,
    });
    expect(player.duration).toBeCloseTo(3, 1);
    expect(warnings).toEqual([
      { code: 'recording-degraded', message: 'exposure-record unavailable' },
      {
        code: 'no-sound',
        message: 'the recording has no audio track; playback follows a silent clock',
      },
    ]);
    expect(canvas.width).toBe(CANVAS_WIDTH * Math.min(window.devicePixelRatio, 2));
  });

  it('reloads without announcing the old session going away', async () => {
    const { player, statuses } = open();
    await player.load(sourceOf(X5_RECORDING_URL));
    await player.load(sourceOf(X5_RECORDING_URL));
    expect(statuses).toEqual(['loading', 'ready', 'idle', 'loading', 'ready']);
  });

  it('plays frames in media order, pauses, seeks and stops with media-element events', async () => {
    const { player, events, frames } = open();
    await player.load(sourceOf(X5_RECORDING_URL));

    await player.play();
    await waitFor(() => frames.length >= 5, 'five presented frames');
    // Playing, or buffering through a stall on a slow machine.
    expect(player.isPaused).toBe(false);
    expect(frames).toEqual(frames.toSorted((left, right) => left - right));
    expect(player.currentTime).toBeGreaterThan(0);

    player.pause();
    expect(player.status).toBe('paused');
    expect(player.isPaused).toBe(true);

    const framesBeforeSeek = frames.length;
    player.seek(seconds(2));
    await waitFor(() => frames.length > framesBeforeSeek, 'a frame after the seek');
    expect(frames.at(-1)).toBeGreaterThanOrEqual(2);
    expect(player.currentTime).toBe(2);

    player.stop();
    expect(player.currentTime).toBe(0);
    expect(player.status).toBe('paused');
    // Whether play found the preloaded frames already primed decides if a `waiting` precedes
    // `playing`, and a slow machine may stall again later; the transport sequence around them
    // does not depend on decode timing.
    const transport = withoutStalls(events);
    expect(transport).toEqual([
      'ready',
      'play',
      'playing',
      'pause',
      'seeking',
      'seeked',
      'seeking',
      'seeked',
    ]);
    expect(events.indexOf('playing')).toBeGreaterThan(events.indexOf('play'));
  });

  it('ends at the end of the clip and, when looping, starts over', async () => {
    const { player, events } = open();
    await player.load(sourceOf(X5_RECORDING_URL));
    player.setLooping(true);
    player.seek(seconds(2.7));

    await player.play();
    await waitFor(() => events.includes('ended'), 'the end of the clip');
    await waitFor(() => player.status === 'playing' && player.currentTime < 1, 'the restart');
    expect(player.isLooping).toBe(true);
  });

  it('announces a change of volume or mute, whoever made it', async () => {
    const { player } = open();
    const heard = new Promise((resolve) => {
      player.events.on('volumechange', resolve);
    });
    const wasMuted = player.isMuted;
    player.setMuted(!wasMuted);
    expect(await heard).toEqual({ volume: 1, isMuted: !wasMuted });
  });

  it('keeps view, view mode and stabilization across loads', async () => {
    const { player } = open();
    player.lookAt(degrees(400), degrees(10));
    player.setStabilization('horizon');
    player.setViewMode('equirectangular');

    await player.load(sourceOf(X5_RECORDING_URL));

    expect(player.view).toMatchObject({ yaw: 40, pitch: 10 });
    expect(player.stabilization).toBe('horizon');
    expect(player.viewMode).toBe('equirectangular');
  });

  it('draws a view mode chosen while the recording was loading', async () => {
    const modeChanges: MockInstance<PictureRenderer['setViewMode']>[] = [];
    const { player } = open(async (parts) => {
      const pipeline = await buildPipeline(parts);
      modeChanges.push(vi.spyOn(pipeline.renderer, 'setViewMode'));
      return pipeline;
    });
    const loading = player.load(sourceOf(X5_RECORDING_URL));
    player.setViewMode('raw-lenses');
    await loading;
    expect(modeChanges[0]).toHaveBeenLastCalledWith('raw-lenses');
  });

  it('shows a changed picture setting at once while paused', async () => {
    const redraws: MockInstance<PlaybackSession<VideoFrame>['redraw']>[] = [];
    const { player } = open(async (parts) => {
      const pipeline = await buildPipeline(parts);
      redraws.push(vi.spyOn(pipeline.session, 'redraw'));
      return pipeline;
    });
    await player.load(sourceOf(X5_RECORDING_URL));
    redraws[0]?.mockClear();
    player.setStabilization('off');
    player.setGainMatching(false);
    expect(redraws[0]).toHaveBeenCalledTimes(2);
  });

  it('starts the recording where a seek during its load asked', async () => {
    const { player } = open();
    const loading = player.load(sourceOf(X5_RECORDING_URL));
    player.seek(seconds(2));
    await loading;
    expect(player.currentTime).toBeCloseTo(2, 3);
  });

  it('ticks the session when the sound ends, which animation frames may not do', async () => {
    const ticks: MockInstance<PlaybackSession<VideoFrame>['tick']>[] = [];
    const { player, audio } = open(async (parts) => {
      const pipeline = await buildPipeline(parts);
      ticks.push(vi.spyOn(pipeline.session, 'tick'));
      return pipeline;
    });
    await player.load(sourceOf(X5_RECORDING_URL));
    player.pause();
    ticks[0]?.mockClear();
    audio.dispatchEvent(new Event('ended'));
    expect(ticks[0]).toHaveBeenCalledOnce();
  });

  it('leaves the decoders idle until play when told not to preload', async () => {
    const preloads: MockInstance<PlaybackSession<VideoFrame>['preload']>[] = [];
    const { player } = open(async (parts) => {
      const pipeline = await buildPipeline(parts);
      preloads.push(vi.spyOn(pipeline.session, 'preload'));
      return pipeline;
    });
    await player.load(sourceOf(X5_RECORDING_URL), { preload: false });
    expect(preloads[0]).not.toHaveBeenCalled();
    await player.load(sourceOf(X5_RECORDING_URL));
    expect(preloads[1]).toHaveBeenCalledOnce();
  });

  it('measures a drag on its own canvas and passes the zoom focus on, before any load', () => {
    const { player } = open();
    player.setViewMode('normal');
    // A quarter of a 128-pixel canvas at 90 degrees across: a quarter of the field.
    player.pan({ x: CANVAS_WIDTH / 4, y: 0 });
    expect(player.view.yaw).toBeCloseTo(-22.5, 9);
    player.resetView();
    player.zoom(2, { x: 0.9, y: 0.5 });
    expect(player.view.yaw).toBeGreaterThan(0);
  });

  it("keeps each view mode's zoom across loads, as it keeps the normal view", async () => {
    const { player } = open();
    await player.load(sourceOf(X5_RECORDING_URL));
    player.setViewMode('raw-lenses');
    expect(player.canPan).toBe(false);
    player.zoom(2);
    expect(player.canPan).toBe(true);
    await player.load(sourceOf(X5_RECORDING_URL));
    expect(player.canPan).toBe(true);
  });

  it('follows the recording audio when the browser can play it, else warns', async () => {
    const { player, warnings } = open();

    await player.load(sourceOf(X5_RECORDING_WITH_AUDIO_URL));

    expect(player.metadata?.hasAudio).toBe(true);
    const isSilent = warnings.some((warning) => warning.code === 'no-sound');
    if (isSilent) {
      expect(warnings).toContainEqual({
        code: 'no-sound',
        message:
          'this browser cannot play the audio track through Media Source Extensions; playback follows a silent clock',
      });
    } else {
      expect(warnings).toEqual([
        { code: 'recording-degraded', message: 'exposure-record unavailable' },
      ]);
    }
    player.setVolume(0.5);
    player.setMuted(false);
    expect(player.volume).toBe(0.5);
    expect(player.isMuted).toBe(false);
  });

  it('reports a source it cannot read as an error and rejects the load', async () => {
    const { player, statuses, errors } = open();

    await expect(player.load(sourceOf(`${X5_RECORDING_URL}.missing`))).rejects.toMatchObject({
      code: 'source-unreadable',
    });

    expect(player.status).toBe('error');
    expect(statuses).toEqual(['loading', 'error']);
    expect(errors.map((error) => error.code)).toEqual(['source-unreadable']);
    await player.load(sourceOf(X5_RECORDING_URL));
    expect(player.status).toBe('ready');
  });

  it('plays once a load in progress is ready, as a media element does', async () => {
    const { player } = open();
    const loading = player.load(sourceOf(X5_RECORDING_URL));
    await player.play();
    await loading;
    expect(player.status).toBe('playing');
  });

  it('fails a load whose pipeline cannot be built with that failure, and plays nothing', async () => {
    const noGpu = new GyroViewError('render-unavailable', 'this test has no GPU');
    const { player, errors } = open(() => Promise.reject(noGpu));
    await expect(player.load(sourceOf(X5_RECORDING_URL))).rejects.toBe(noGpu);
    expect(player.status).toBe('error');
    expect(errors).toEqual([noGpu]);
    expect(player.metadata).toBeUndefined();
  });

  it('fails a load on an abort it did not cause instead of waiting for ever', async () => {
    const foreignAbort = new DOMException('the page aborted its requests', 'AbortError');
    const { player, errors } = open(() => Promise.reject(foreignAbort));
    await expect(player.load(sourceOf(X5_RECORDING_URL))).rejects.toMatchObject({
      code: 'invariant-violation',
      cause: foreignAbort,
    });
    expect(player.status).toBe('error');
    expect(errors).toHaveLength(1);
  });

  it('starts the next recording where a seek asked for after its playback failed', async () => {
    const { ports, breakDecoder } = breakableDecoders();
    const { player } = open(buildPipeline, ports);
    await player.load(sourceOf(X5_RECORDING_URL));
    await breakDecoder();
    await waitFor(() => player.status === 'error', 'the decode failure');
    player.seek(1.5);
    await player.load(sourceOf(X5_RECORDING_URL));
    expect(player.currentTime).toBeCloseTo(1.5, 1);
  });

  it('refuses to play after a failed load with that failure', async () => {
    const { player } = open();
    await expect(player.load(sourceOf(`${X5_RECORDING_URL}.missing`))).rejects.toThrow();
    await expect(player.play()).rejects.toMatchObject({ code: 'source-unreadable' });
  });

  describe('ends the reads of a recording', () => {
    it('it unloads', async () => {
      const { ports, signals } = capturingSignals();
      const { player } = open(buildPipeline, ports);
      await player.load(sourceOf(X5_RECORDING_URL));
      expect(signals.some((signal) => signal.aborted)).toBe(false);
      player.unload();
      expect(signals.length).toBeGreaterThan(0);
      expect(signals.every((signal) => signal.aborted)).toBe(true);
    });

    it('that failed to load', async () => {
      const { ports, signals } = capturingSignals();
      const { player } = open(buildPipeline, ports);
      await expect(player.load(sourceOf(`${X5_RECORDING_URL}.missing`))).rejects.toMatchObject({
        code: 'source-unreadable',
      });
      expect(signals.length).toBeGreaterThan(0);
      expect(signals.every((signal) => signal.aborted)).toBe(true);
    });
  });

  it("leaves a load made on ready its own start time and no autoplay of the older load's", async () => {
    const { player } = open();
    const loadsOnReady: Promise<void>[] = [];
    const stopListening = player.events.on('ready', () => {
      stopListening();
      loadsOnReady.push(player.load(sourceOf(X5_RECORDING_URL)));
      player.seek(seconds(1.5));
    });
    await player.load(sourceOf(X5_RECORDING_URL), { autoplay: true });
    await Promise.all(loadsOnReady);
    expect(player.currentTime).toBeCloseTo(1.5, 6);
    expect(player.isPaused).toBe(true);
  });

  it('refuses times and view changes that are not finite numbers', async () => {
    const { player } = open();
    const refusal = { code: 'invalid-argument' };
    expect(() => {
      player.seek(seconds(NaN));
    }).toThrow(expect.objectContaining(refusal));
    await expect(player.scrub(seconds(NaN))).rejects.toMatchObject(refusal);
    expect(() => {
      player.lookAt(degrees(NaN), degrees(0));
    }).toThrow(expect.objectContaining(refusal));
    expect(() => {
      player.zoom(Infinity);
    }).toThrow(expect.objectContaining(refusal));
    expect(() => {
      player.setView({ ...player.view, fieldOfView: degrees(NaN) });
    }).toThrow(expect.objectContaining(refusal));
    expect(() => {
      player.turn(degrees(0), degrees(NaN));
    }).toThrow(expect.objectContaining(refusal));
    expect(() => {
      player.setVolume(NaN);
    }).toThrow(expect.objectContaining(refusal));
  });

  it('leaves a load made on the idle of a reload to that load alone', async () => {
    const { player } = open();
    await player.load(sourceOf(X5_RECORDING_URL));
    const readies: unknown[] = [];
    player.events.on('ready', (metadata) => {
      readies.push(metadata);
    });
    const loadsOnIdle: Promise<void>[] = [];
    const stopListening = player.events.on('statuschange', (status) => {
      if (status !== 'idle') return;
      stopListening();
      loadsOnIdle.push(player.load(sourceOf(X5_RECORDING_WITH_AUDIO_URL)));
    });
    await player.load(sourceOf(X5_RECORDING_URL));
    await Promise.all(loadsOnIdle);
    await settle();
    expect(readies).toHaveLength(1);
    expect(player.metadata?.hasAudio).toBe(true);
  });

  describe('with a listener that loads again on the status a load announces', () => {
    it('hears no ready of the recording that load replaced', async () => {
      const { player } = open();
      const readies: PlayerMetadata[] = [];
      player.events.on('ready', (metadata) => {
        readies.push(metadata);
      });
      const loadsOnReady: Promise<void>[] = [];
      const stopListening = player.events.on('statuschange', (status) => {
        if (status !== 'ready') return;
        stopListening();
        loadsOnReady.push(player.load(sourceOf(X5_RECORDING_WITH_AUDIO_URL)));
      });
      await player.load(sourceOf(X5_RECORDING_URL));
      await Promise.all(loadsOnReady);
      expect(readies.map((metadata) => metadata.hasAudio)).toEqual([true]);
    });

    it('hears no error of the load it gave up on', async () => {
      const { player, errors } = open();
      const loadsOnError: Promise<void>[] = [];
      const stopListening = player.events.on('statuschange', (status) => {
        if (status !== 'error') return;
        stopListening();
        loadsOnError.push(player.load(sourceOf(X5_RECORDING_URL)));
      });
      await expect(player.load(sourceOf(`${X5_RECORDING_URL}.missing`))).rejects.toMatchObject({
        code: 'source-unreadable',
      });
      await Promise.all(loadsOnError);
      expect(errors).toEqual([]);
      expect(player.status).toBe('ready');
    });

    it('loads nothing once disposed', async () => {
      const { player } = open();
      await player.load(sourceOf(X5_RECORDING_URL));
      player.events.on('statuschange', (status) => {
        if (status === 'idle') void player.load(sourceOf(X5_RECORDING_URL));
      });
      player.dispose();
      await settle();
      expect(player.status).toBe('idle');
    });
  });

  it('lets go of a recording whose load failed after it was attached', async () => {
    let disposals = 0;
    const refusingSeamMeter: PipelineFactory = async (parts) => {
      const pipeline = await buildPipeline(parts);
      return {
        ...pipeline,
        setGainMatching: (): void => {
          throw new GyroViewError('render-unavailable', 'the seam shader did not compile');
        },
        dispose: (): void => {
          disposals += 1;
          pipeline.dispose();
        },
      };
    };
    const { player } = open(refusingSeamMeter);
    await expect(player.load(sourceOf(X5_RECORDING_URL))).rejects.toMatchObject({
      code: 'render-unavailable',
    });
    expect(disposals).toBe(1);
    expect(player.status).toBe('error');
  });

  it('lets a newer load supersede an older one quietly and ignores transport before a load', async () => {
    const { player, events, errors } = open();
    await player.play();
    player.pause();
    player.seek(seconds(1));
    expect(player.status).toBe('idle');

    const superseded = player.load(sourceOf(X5_RECORDING_WITH_AUDIO_URL));
    await player.load(sourceOf(X5_RECORDING_URL));
    await superseded;

    expect(events.filter((name) => name === 'ready')).toHaveLength(1);
    expect(errors).toEqual([]);
    expect(player.metadata?.hasAudio).toBe(false);
    player.unload();
    expect(player.status).toBe('idle');
    expect(player.metadata).toBeUndefined();
  });
});
