import {
  degrees,
  GyroViewError,
  seconds,
  type PictureRenderer,
  type Seconds,
} from '@gyroview/core';
import { afterEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import { Player } from './Player';
import type { PlayerStatus } from './PlayerEvents';
import { browserPorts } from '../composition/browserPorts';
import { buildPipeline } from '../composition/buildPipeline';
import type { PipelineFactory } from '../composition/ports';
import type { PlayerSource } from '../PlayerSource';
import { X5_RECORDING_URL, X5_RECORDING_WITH_AUDIO_URL } from '../test/recordings';

const CANVAS_WIDTH = 128;
const CANVAS_HEIGHT = 64;
const WAIT_MS = 15_000;
const POLL_MS = 20;

function sourceOf(url: string): PlayerSource {
  return { main: { url }, second: undefined };
}

async function waitFor(isSatisfied: () => boolean, what: string): Promise<void> {
  const deadline = performance.now() + WAIT_MS;
  while (!isSatisfied()) {
    if (performance.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => {
      setTimeout(resolve, POLL_MS);
    });
  }
}

interface Harness {
  readonly player: Player;
  readonly canvas: HTMLCanvasElement;
  readonly statuses: PlayerStatus[];
  readonly events: string[];
  readonly frames: Seconds[];
  readonly warnings: string[];
  readonly errors: GyroViewError[];
}

function harness(pipelines: PipelineFactory): Harness {
  const canvas = document.createElement('canvas');
  canvas.style.width = `${CANVAS_WIDTH}px`;
  canvas.style.height = `${CANVAS_HEIGHT}px`;
  const audio = document.createElement('audio');
  audio.muted = true;
  document.body.append(canvas, audio);
  const player = new Player({ host: { canvas, audio }, ports: browserPorts(), pipelines });
  const statuses: PlayerStatus[] = [];
  const events: string[] = [];
  const frames: Seconds[] = [];
  const warnings: string[] = [];
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
  return { player, canvas, statuses, events, frames, warnings, errors };
}

describe('Player over the synthetic X5 recording', () => {
  const harnesses: Harness[] = [];

  function open(pipelines: PipelineFactory = buildPipeline): Harness {
    const created = harness(pipelines);
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
      'exposure-record unavailable',
      'the recording has no audio track; playback follows a silent clock',
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
    expect(player.status).toBe('playing');
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
    // `playing`; the transport sequence around it does not depend on decode timing.
    const transport = events.filter((name) => name !== 'waiting');
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

  it('lets the view mode rule the gestures: the panorama ignores zoom, the normal view zooms and turns', async () => {
    const { player } = open();
    await player.load(sourceOf(X5_RECORDING_URL));
    player.setViewMode('equirectangular');
    player.zoom(1);
    expect(player.view.fieldOfView).toBe(90);
    player.setViewMode('normal');
    player.zoom(1);
    player.turn(degrees(5), degrees(-5));
    expect(player.view.fieldOfView).toBeLessThan(90);
    expect(player.view).toMatchObject({ yaw: 5, pitch: -5 });
  });

  it('announces view and mode changes only when something changed', async () => {
    const { player } = open();
    const views: number[] = [];
    const modes: string[] = [];
    player.events.on('viewchange', (view) => {
      views.push(view.yaw);
    });
    player.events.on('viewmodechange', (mode) => {
      modes.push(mode);
    });
    await player.load(sourceOf(X5_RECORDING_URL));
    player.lookAt(degrees(40), degrees(0));
    player.setViewMode('equirectangular');
    player.zoom(1);
    player.setViewMode('equirectangular');
    player.resetView();
    player.resetView();
    expect(views).toEqual([40, 0]);
    expect(modes).toEqual(['equirectangular']);
  });

  it('follows the recording audio when the browser can play it, else warns', async () => {
    const { player, warnings } = open();

    await player.load(sourceOf(X5_RECORDING_WITH_AUDIO_URL));

    expect(player.metadata?.hasAudio).toBe(true);
    const isSilent = warnings.some((warning) => warning.includes('silent clock'));
    if (isSilent) {
      expect(warnings).toContain(
        'this browser cannot play the audio track through Media Source Extensions; playback follows a silent clock',
      );
    } else {
      expect(warnings).toEqual(['exposure-record unavailable']);
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

  it('refuses to play after a failed load with that failure', async () => {
    const { player } = open();
    await expect(player.load(sourceOf(`${X5_RECORDING_URL}.missing`))).rejects.toThrow();
    await expect(player.play()).rejects.toMatchObject({ code: 'source-unreadable' });
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
