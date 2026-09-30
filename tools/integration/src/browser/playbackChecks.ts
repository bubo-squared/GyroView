import { MediaSourceAudioClock } from '@gyroview/adapter-mse-audio';
import type { PlaybackSession } from '@gyroview/core';
import type { FakeFrameSink } from '@gyroview/core/testing';
import type { OpenedRecording } from '@gyroview/player/composition';
import { expect } from 'vitest';

import type { SampleRecording } from './sampleUrls';

/**
 * The picture may trail the sound by less than this many frames: one being decoded, one queued,
 * one on screen.
 */
const MAX_LAG_FRAMES = 3;

/**
 * The recording's own sound as the playback clock, on a muted audio element that the cleanups
 * remove with the clock.
 */
export async function openAudioClock(
  opened: OpenedRecording,
  cleanups: (() => void)[],
): Promise<MediaSourceAudioClock> {
  const { soundSegments } = opened;
  if (!soundSegments) throw new Error('the recording has no audio track');
  const element = document.createElement('audio');
  element.muted = true;
  document.body.append(element);
  const clock = await MediaSourceAudioClock.open(element, soundSegments());
  cleanups.push(() => {
    clock.dispose();
    element.remove();
  });
  return clock;
}

/**
 * Drives the session once per animation frame until the cleanup runs.
 */
export function startTicking(session: PlaybackSession<VideoFrame>, cleanups: (() => void)[]): void {
  let isTicking = true;
  cleanups.push(() => {
    isTicking = false;
  });
  const tick = (): void => {
    if (!isTicking) return;
    session.tick();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/**
 * The pictures were shown in order, and the latest trails the sound by less than a few frames.
 */
export function expectPictureFollowsSound(
  sink: FakeFrameSink<VideoFrame>,
  sample: SampleRecording,
): void {
  const timestamps = sink.presentations.map((presentation) => presentation.pair.timestamp);
  expect(timestamps).toEqual(timestamps.toSorted((left, right) => left - right));
  const latest = sink.presentations.at(-1);
  if (!latest) throw new Error('nothing was presented');
  expect(latest.pair.timestamp).toBeLessThanOrEqual(latest.mediaTime);
  expect(latest.mediaTime - latest.pair.timestamp).toBeLessThan(MAX_LAG_FRAMES / sample.frameRate);
}
