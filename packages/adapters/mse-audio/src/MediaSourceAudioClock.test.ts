import { MediabunnyDemuxer } from '@gyroview/adapter-mediabunny';
import {
  GyroViewError,
  seconds,
  secondsToMilliseconds,
  type AudioSegmentSource,
  type DemuxedInput,
} from '@gyroview/core';
import { describePlaybackClockContract, InMemoryRandomAccessSource } from '@gyroview/core/testing';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { MediaSourceAudioClock } from './MediaSourceAudioClock';
import fixtureUrl from '../../../../test/fixtures/synthetic/dual-track-aac-64px-10fps-3s.mp4?url';

const AAC_IN_MP4 = 'audio/mp4; codecs="mp4a.40.2"';
const isSupported = MediaSourceAudioClock.isSupported({ mimeType: AAC_IN_MP4 });

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * How long a test waits for the audio before it gives up.
 */
const WAIT_TIMEOUT_MS = 4000;

/**
 * Polls until the condition holds or the timeout passes, whichever is first.
 */
async function waitUntil(isSatisfied: () => boolean): Promise<void> {
  const deadline = performance.now() + WAIT_TIMEOUT_MS;
  while (!isSatisfied() && performance.now() < deadline) await wait(20);
}

function waitUntilPast(clock: MediaSourceAudioClock, time: number): Promise<void> {
  return waitUntil(() => clock.currentTime > time);
}

describe.skipIf(!isSupported)('MediaSourceAudioClock', () => {
  let input: DemuxedInput;
  let source: AudioSegmentSource;
  const elements: HTMLAudioElement[] = [];
  const clocks: MediaSourceAudioClock[] = [];

  async function openClock(): Promise<MediaSourceAudioClock> {
    const element = document.createElement('audio');
    element.muted = true;
    document.body.append(element);
    elements.push(element);
    const clock = await MediaSourceAudioClock.open(element, source);
    clocks.push(clock);
    return clock;
  }

  beforeAll(async () => {
    const response = await fetch(fixtureUrl);
    const bytes = new Uint8Array(await response.arrayBuffer());
    input = await new MediabunnyDemuxer().open(
      new InMemoryRandomAccessSource(bytes),
      'aac fixture',
    );
    const [audio] = input.audioTracks;
    if (!audio) throw new Error('fixture has no audio track');
    source = await audio.openSegments();
  });

  afterEach(() => {
    for (const clock of clocks.splice(0)) clock.dispose();
    for (const element of elements.splice(0)) element.remove();
  });

  afterAll(() => {
    input.dispose();
  });

  describePlaybackClockContract(async () => ({
    clock: await openClock(),
    letTimePass: (elapsed): Promise<void> => wait(secondsToMilliseconds(elapsed)),
  }));

  it('stops running when someone else pauses its element, as media keys do', async () => {
    const clock = await openClock();
    await clock.start();
    expect(clock.isRunning).toBe(true);
    elements.at(-1)?.pause();
    expect(clock.isRunning).toBe(false);
    expect(clock.hasEnded).toBe(false);
  });

  it('leaves the element alone on disposal when it plays another source by then', async () => {
    const clock = await openClock();
    const element = elements.at(-1);
    const newer = URL.createObjectURL(new Blob());
    if (element) element.src = newer;
    clock.dispose();
    expect(element?.src).toBe(newer);
    URL.revokeObjectURL(newer);
  });

  it('seeks to a time and continues from there', async () => {
    const clock = await openClock();
    clock.seek(seconds(2));
    expect(clock.currentTime).toBeCloseTo(2, 2);
    await clock.start();
    await waitUntilPast(clock, 2.3);
    expect(clock.currentTime).toBeGreaterThan(2.3);
    expect(clock.currentTime).toBeLessThanOrEqual(3.05);
  });

  it('reports the end when the track runs out', async () => {
    const clock = await openClock();
    clock.seek(seconds(2.6));
    await clock.start();
    await waitUntil(() => clock.hasEnded);
    expect(clock.hasEnded).toBe(true);
    expect(clock.currentTime).toBeCloseTo(3, 1);
    expect(clock.failure).toBeUndefined();
  });

  it('reports a failing segment source through failure instead of swallowing it', async () => {
    const broken: AudioSegmentSource = {
      mimeType: source.mimeType,
      duration: source.duration,
      // eslint-disable-next-line @typescript-eslint/require-await -- an async generator that fails at once
      async *segmentsFrom(): AsyncGenerator<Uint8Array<ArrayBuffer>> {
        throw new GyroViewError('source-unreadable', 'audio range request failed');
      },
    };
    const element = document.createElement('audio');
    element.muted = true;
    document.body.append(element);
    elements.push(element);
    const clock = await MediaSourceAudioClock.open(element, broken);
    clocks.push(clock);
    await waitUntil(() => clock.failure !== undefined);
    expect(clock.failure?.code).toBe('source-unreadable');
  });

  it('treats a pause that interrupts the start as a plain pause, not an error', async () => {
    const clock = await openClock();
    const starting = clock.start();
    clock.pause();
    await expect(starting).resolves.toBeUndefined();
    const held = clock.currentTime;
    await wait(300);
    expect(clock.currentTime).toBeCloseTo(held, 2);
  });
});
