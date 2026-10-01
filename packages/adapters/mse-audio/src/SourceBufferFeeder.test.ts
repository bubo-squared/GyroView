import { Deferred, seconds, type AudioSegmentSource } from '@gyroview/core';
import { describe, expect, it } from 'vitest';

import {
  attachMediaSource,
  isMediaSourceTypeSupported,
  mediaSourceConstructor,
  type AttachedMediaSource,
} from './mediaSourceSupport';
import { SourceBufferFeeder } from './SourceBufferFeeder';
import { openFixtureAudio } from './test/fixtureAudio';

const AAC_IN_MP4 = 'audio/mp4; codecs="mp4a.40.2"';

/**
 * Polls until the condition holds, for at most `withinMs`.
 */
async function waitUntil(isSatisfied: () => boolean, withinMs = 2000): Promise<void> {
  const deadline = performance.now() + withinMs;
  while (!isSatisfied() && performance.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/**
 * A source with nothing to append; the first test disposes its feeder before any run starts.
 */
const UNREAD_SOURCE: AudioSegmentSource = {
  mimeType: AAC_IN_MP4,
  duration: seconds(3),
  async *segmentsFrom(): AsyncGenerator<Uint8Array<ArrayBuffer>> {
    // Nothing to append.
  },
};

/**
 * Segments that never come, as from a stalled network: a run over them waits until stopped.
 */
async function* neverEnding(): AsyncGenerator<Uint8Array<ArrayBuffer>> {
  await new Promise<never>(() => {
    // never settled on purpose
  });
}

async function openMediaSource(element: HTMLMediaElement): Promise<AttachedMediaSource> {
  const mediaSourceClass = mediaSourceConstructor();
  if (!mediaSourceClass) throw new Error('this browser has no media source');
  return attachMediaSource(element, mediaSourceClass);
}

/**
 * The fixture's first segments: its initialisation and about a second of audio.
 */
const FIRST_SECOND = 2;
/**
 * A time inside that first second.
 */
const SEEK_WITHIN = 0.5;
/**
 * How far before the end of what a stopped run appended a seek goes, and past it playback must
 * then get: across the seam between the two runs' audio.
 */
const ACROSS_THE_SEAM = 0.3;
/**
 * Headless WebKit under load is slow to start playing.
 */
const PLAYBACK_WITHIN_MS = 10_000;
/**
 * A time past the first second, which a run stalled after it has not appended.
 */
const SEEK_BEYOND_THE_FIRST = 2;

type Segments = AsyncIterable<Uint8Array<ArrayBuffer>>;

function everySegment(segments: Segments): Segments {
  return segments;
}

/**
 * The first `count` segments, then none ever again: a run that waits as on a stalled network.
 * `stalled` resolves once the run asks for the next segment, its last one appended.
 */
function stallingAfter(count: number, stalled: Deferred<void>): (segments: Segments) => Segments {
  return async function* (segments) {
    let yielded = 0;
    for await (const segment of segments) {
      if (yielded === count) break;
      yield segment;
      yielded += 1;
    }
    stalled.resolve();
    await new Promise<never>(() => {
      // never settled on purpose
    });
  };
}

interface FixtureFeeder {
  readonly feeder: SourceBufferFeeder;
  readonly element: HTMLAudioElement;
  readonly mediaSource: MediaSource;
  readonly sourceBuffer: SourceBuffer;
  /**
   * The time each run asked the source for segments from.
   */
  readonly asked: number[];
  readonly close: () => void;
}

/**
 * A feeder of the fixture's audio into a real media source, the first run's segments passed
 * through `firstRun`.
 */
async function fixtureFeeder(firstRun: (segments: Segments) => Segments): Promise<FixtureFeeder> {
  const fixture = await openFixtureAudio();
  const element = document.createElement('audio');
  document.body.append(element);
  const attached = await openMediaSource(element);
  const { mediaSource } = attached;
  const sourceBuffer = mediaSource.addSourceBuffer(fixture.source.mimeType);
  mediaSource.duration = fixture.source.duration;
  const asked: number[] = [];
  const feeder = new SourceBufferFeeder({
    element,
    mediaSource,
    sourceBuffer,
    source: {
      mimeType: fixture.source.mimeType,
      duration: fixture.source.duration,
      segmentsFrom: (time): Segments => {
        asked.push(time);
        const segments = fixture.source.segmentsFrom(time);
        return asked.length === 1 ? firstRun(segments) : segments;
      },
    },
  });
  const close = (): void => {
    feeder.dispose();
    attached.detach();
    element.remove();
    fixture.dispose();
  };
  return { feeder, element, mediaSource, sourceBuffer, asked, close };
}

describe.skipIf(!isMediaSourceTypeSupported(AAC_IN_MP4))('SourceBufferFeeder', () => {
  it('disposes while old audio is being evicted, which a source buffer cannot abort', async () => {
    const element = document.createElement('audio');
    document.body.append(element);
    const attached = await openMediaSource(element);
    const { mediaSource } = attached;
    const sourceBuffer = mediaSource.addSourceBuffer(AAC_IN_MP4);
    mediaSource.duration = UNREAD_SOURCE.duration;
    const feeder = new SourceBufferFeeder({
      element,
      mediaSource,
      sourceBuffer,
      source: UNREAD_SOURCE,
    });
    sourceBuffer.remove(0, 1);
    expect(sourceBuffer.updating).toBe(true);
    expect(() => {
      feeder.dispose();
    }).not.toThrow();
    attached.detach();
    element.remove();
  });

  it('feeds a second before the time it restarts from, and from the start before that', async () => {
    const element = document.createElement('audio');
    document.body.append(element);
    const attached = await openMediaSource(element);
    const { mediaSource } = attached;
    const sourceBuffer = mediaSource.addSourceBuffer(AAC_IN_MP4);
    const asked: number[] = [];
    const feeder = new SourceBufferFeeder({
      element,
      mediaSource,
      sourceBuffer,
      source: {
        ...UNREAD_SOURCE,
        segmentsFrom: (time): AsyncIterable<Uint8Array<ArrayBuffer>> => {
          asked.push(time);
          return neverEnding();
        },
      },
    });
    feeder.restartFrom(seconds(2.5));
    await waitUntil(() => asked.length === 1);
    feeder.restartFrom(seconds(0.5));
    await waitUntil(() => asked.length === 2);
    expect(asked).toEqual([1.5, 0]);
    feeder.dispose();
    attached.detach();
    element.remove();
  });

  it('appends only what is missing after a seek within the audio already buffered', async () => {
    const stalled = new Deferred<void>();
    const { feeder, element, asked, close } = await fixtureFeeder(
      stallingAfter(FIRST_SECOND, stalled),
    );
    feeder.restartFrom(seconds(0));
    await stalled.promise;
    const stalledAt = element.buffered.end(0);
    expect(stalledAt).toBeGreaterThan(SEEK_WITHIN);
    feeder.restartFrom(seconds(SEEK_WITHIN));
    await waitUntil(() => asked.length === 2);
    expect(asked[1]).toBe(stalledAt);
    close();
  });

  // A seek stops a run between any two of its segments: playing from the last run's audio into
  // the next run's must still decode, which only playing shows.
  for (const appended of [1, 2, 3]) {
    it(`plays from one run's audio into the next after a seek stopped a run after ${appended} of its segments`, async () => {
      const stalled = new Deferred<void>();
      const { feeder, element, close } = await fixtureFeeder(stallingAfter(appended, stalled));
      feeder.restartFrom(seconds(0));
      await stalled.promise;
      const seam = element.buffered.length > 0 ? element.buffered.end(0) : 0;
      const from = Math.max(0, seam - ACROSS_THE_SEAM);
      element.muted = true;
      element.currentTime = from;
      feeder.restartFrom(seconds(from));
      await element.play();
      await waitUntil(
        () => element.error !== null || element.currentTime > seam + ACROSS_THE_SEAM,
        PLAYBACK_WITHIN_MS,
      );
      expect(element.error).toBeNull();
      expect(feeder.failure).toBeUndefined();
      expect(element.currentTime).toBeGreaterThan(seam + ACROSS_THE_SEAM);
      close();
    });
  }

  it("leaves a failed element's own error to say why, appending nothing more", async () => {
    const stalled = new Deferred<void>();
    const { feeder, element, mediaSource, close } = await fixtureFeeder(
      stallingAfter(FIRST_SECOND, stalled),
    );
    feeder.restartFrom(seconds(0));
    await stalled.promise;
    // How a segment the parser cannot read fails the element, in every engine alike: the append
    // error algorithm ends the stream with a decode error.
    mediaSource.endOfStream('decode');
    await waitUntil(() => element.error !== null);
    expect(element.error?.code).toBe(MediaError.MEDIA_ERR_DECODE);
    feeder.restartFrom(seconds(SEEK_BEYOND_THE_FIRST));
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(element.error).not.toBeNull();
    expect(feeder.failure).toBeUndefined();
    close();
  });

  it('starts no run after a seek within audio buffered to the end of the ended stream', async () => {
    const { feeder, element, mediaSource, asked, close } = await fixtureFeeder(everySegment);
    feeder.restartFrom(seconds(0));
    await waitUntil(() => mediaSource.readyState === 'ended');
    feeder.restartFrom(seconds(1));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(asked).toHaveLength(1);
    expect(mediaSource.readyState).toBe('ended');
    expect(element.error).toBeNull();
    expect(feeder.failure).toBeUndefined();
    close();
  });
});
