import { degrees, seconds, type GyroViewError, type Seconds } from '@gyroview/core';
import { afterEach, describe, expect, it } from 'vitest';

import { Player } from './Player';
import type { PlayerStatus } from './PlayerEvents';
import { browserPorts } from '../composition/browserPorts';
import type { PlayerSource } from '../PlayerSource';
import { X5_RECORDING_URL, X5_RECORDING_WITH_AUDIO_URL } from '../test/recordings';

const CANVAS_WIDTH = 128;
const CANVAS_HEIGHT = 64;
const WAIT_MS = 15_000;
const POLL_MS = 20;

function sourceOf(url: string): PlayerSource {
  return {
    main: { url },
    second: undefined,
    proxy: undefined,
    shouldDiscoverProxy: false,
    quality: 'auto',
  };
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

function harness(): Harness {
  const canvas = document.createElement('canvas');
  canvas.style.width = `${CANVAS_WIDTH}px`;
  canvas.style.height = `${CANVAS_HEIGHT}px`;
  const audio = document.createElement('audio');
  audio.muted = true;
  document.body.append(canvas, audio);
  const player = new Player({ host: { canvas, audio }, ports: browserPorts() });
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

  function open(): Harness {
    const created = harness();
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
      isProxy: false,
    });
    expect(player.duration).toBeCloseTo(3, 1);
    expect(warnings).toEqual([
      'exposure-record unavailable',
      'the recording has no audio track; playback follows a silent clock',
    ]);
    expect(canvas.width).toBe(CANVAS_WIDTH * Math.min(window.devicePixelRatio, 2));
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

  it('keeps view and stabilization across loads and redraws while paused', async () => {
    const { player } = open();
    const views: number[] = [];
    player.events.on('viewchange', (view) => {
      views.push(view.yaw);
    });
    player.lookAt(degrees(400), degrees(10));
    player.setStabilization('horizon');

    await player.load(sourceOf(X5_RECORDING_URL));

    expect(player.view).toMatchObject({ yaw: 40, pitch: 10 });
    expect(player.stabilization).toBe('horizon');
    player.zoom(1);
    expect(player.view.fieldOfView).toBeLessThan(90);
    player.resetView();
    expect(player.view).toMatchObject({ yaw: 0, pitch: 0, fieldOfView: 90 });
    player.setStabilization('off');
    expect(views).toEqual([40, 40, 0]);
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
