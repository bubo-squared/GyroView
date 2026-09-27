import { seconds, type AudioSegmentSource } from '@gyroview/core';
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
 * Nearly all of the fixture's three seconds of audio.
 */
const FIXTURE_END_BUFFERED = 2.9;

/**
 * Polls until the condition holds, for at most two seconds.
 */
async function waitUntil(isSatisfied: () => boolean): Promise<void> {
  const deadline = performance.now() + 2000;
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

async function openMediaSource(element: HTMLMediaElement): Promise<AttachedMediaSource> {
  const mediaSourceClass = mediaSourceConstructor();
  if (!mediaSourceClass) throw new Error('this browser has no media source');
  return attachMediaSource(element, mediaSourceClass);
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
          return UNREAD_SOURCE.segmentsFrom(time);
        },
      },
    });
    feeder.restartFrom(seconds(2.5));
    feeder.restartFrom(seconds(0.5));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(asked).toEqual([1.5, 0]);
    feeder.dispose();
    attached.detach();
    element.remove();
  });

  it('appends only what is missing after a seek within the audio already buffered', async () => {
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
        segmentsFrom: (time): AsyncIterable<Uint8Array<ArrayBuffer>> => {
          asked.push(time);
          return fixture.source.segmentsFrom(time);
        },
      },
    });
    const bufferedEnd = (): number => (element.buffered.length > 0 ? element.buffered.end(0) : 0);
    feeder.restartFrom(seconds(0));
    await waitUntil(() => bufferedEnd() > FIXTURE_END_BUFFERED);
    feeder.restartFrom(seconds(1));
    await waitUntil(() => asked.length === 2);
    expect(asked[1]).toBeGreaterThan(FIXTURE_END_BUFFERED);
    feeder.dispose();
    attached.detach();
    element.remove();
    fixture.dispose();
  });
});
