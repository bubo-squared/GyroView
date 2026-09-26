import { MediabunnyAudioSegmenter } from '@gyroview/adapter-mediabunny';
import { MediaSourceAudioClock } from '@gyroview/adapter-mse-audio';
import { DecodePipeline, PlaybackSession, seconds } from '@gyroview/core';
import { FakeFrameSink } from '@gyroview/core/testing';
import {
  DECODE_PIPELINE_OPTIONS,
  PAIR_QUEUE_CAPACITY,
  type OpenedRecording,
} from '@gyroview/player/composition';
import { afterEach, describe, expect, it } from 'vitest';

import {
  closeAll,
  expectLockstep,
  openSample,
  port,
  DECODE_TIMEOUT_MS,
  skipUnlessServed,
  takePairs,
  waitFor,
} from './realRecordingSupport';
import { OFFICE_5K7_60, SAILING_8K_30, type SampleRecording } from './sampleUrls';

const PRESENTATIONS_BEFORE_SEEK = 30;
const SEEK_TARGET = seconds(120);
const MID_FILE_START = seconds(100);
const PAIRS_TO_TAKE = 20;
const TIMESTAMP_TOLERANCE = 1e-3;

async function openAudioClock(
  opened: OpenedRecording,
  cleanups: (() => void)[],
): Promise<MediaSourceAudioClock> {
  const { audioTrack } = opened;
  if (!audioTrack) throw new Error('the recording has no audio track');
  const element = document.createElement('audio');
  element.muted = true;
  document.body.append(element);
  cleanups.push(() => {
    element.remove();
  });
  const segments = await new MediabunnyAudioSegmenter().open(audioTrack);
  return MediaSourceAudioClock.open(element, segments);
}

/**
 * Drives the session once per animation frame until the cleanup runs.
 */
function startTicking(session: PlaybackSession<VideoFrame>, cleanups: (() => void)[]): void {
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

function expectPictureFollowsSound(sink: FakeFrameSink<VideoFrame>, sample: SampleRecording): void {
  const timestamps = sink.presentations.map((presentation) => presentation.pair.timestamp);
  expect(timestamps).toEqual(timestamps.toSorted((left, right) => left - right));
  const latest = sink.presentations.at(-1);
  if (!latest) throw new Error('nothing was presented');
  expect(latest.pair.timestamp).toBeLessThanOrEqual(latest.mediaTime);
  expect(latest.mediaTime - latest.pair.timestamp).toBeLessThan(3 / sample.frameRate);
}

describe('the browser pipeline on the real X5 recordings', () => {
  const cleanups: (() => void)[] = [];

  afterEach(() => {
    for (const cleanup of cleanups.splice(0).toReversed()) cleanup();
  });

  it('reads the office recording over HTTP ranges and decodes both lenses in lockstep from a mid-file time', async (context) => {
    await skipUnlessServed(context, OFFICE_5K7_60);
    const opened = await openSample(context, OFFICE_5K7_60);
    cleanups.push(() => {
      opened.dispose();
    });
    expect(opened.recording.info.model).toBe('Insta360 X5');
    expect(opened.frameSources).toHaveLength(2);

    const pipeline = new DecodePipeline<VideoFrame>(
      opened.frameSources,
      port,
      DECODE_PIPELINE_OPTIONS,
    );
    const pairs = await takePairs(pipeline, MID_FILE_START, PAIRS_TO_TAKE);
    try {
      const first = pairs[0]?.timestamp ?? NaN;
      expect(first).toBeLessThanOrEqual(MID_FILE_START + TIMESTAMP_TOLERANCE);
      expect(first).toBeGreaterThan(MID_FILE_START - 1 / OFFICE_5K7_60.frameRate);
      expectLockstep(pairs, OFFICE_5K7_60);
    } finally {
      closeAll(pairs);
    }
  });

  it('plays the office recording through the session in step with its own audio and follows a seek', async (context) => {
    await skipUnlessServed(context, OFFICE_5K7_60);
    const opened = await openSample(context, OFFICE_5K7_60);
    cleanups.push(() => {
      opened.dispose();
    });
    const clock = await openAudioClock(opened, cleanups);
    const sink = new FakeFrameSink<VideoFrame>();
    const session = new PlaybackSession<VideoFrame>({
      frameSources: opened.frameSources,
      decoderPort: port,
      clock,
      sink,
      duration: opened.duration,
      pipeline: DECODE_PIPELINE_OPTIONS,
      queueCapacity: PAIR_QUEUE_CAPACITY,
    });
    cleanups.push(() => {
      session.dispose();
    });
    startTicking(session, cleanups);

    await session.play();
    await waitFor(
      () => sink.presentations.length >= PRESENTATIONS_BEFORE_SEEK,
      DECODE_TIMEOUT_MS,
      'the first presentations',
    );
    expectPictureFollowsSound(sink, OFFICE_5K7_60);
    expect(clock.failure).toBeUndefined();

    session.seek(SEEK_TARGET);
    await waitFor(
      () => (sink.lastTimestamp ?? 0) >= SEEK_TARGET - 1 / OFFICE_5K7_60.frameRate,
      DECODE_TIMEOUT_MS,
      'a frame at the seek target',
    );
    expect(session.state).toBe('playing');
    expect(clock.currentTime).toBeGreaterThanOrEqual(SEEK_TARGET);
    expect(clock.currentTime).toBeLessThan(SEEK_TARGET + 2);
  });

  it('probes and decodes the first frames of the 8K sailing recording', async (context) => {
    await skipUnlessServed(context, SAILING_8K_30);
    const opened = await openSample(context, SAILING_8K_30);
    cleanups.push(() => {
      opened.dispose();
    });

    const pipeline = new DecodePipeline<VideoFrame>(
      opened.frameSources,
      port,
      DECODE_PIPELINE_OPTIONS,
    );
    const pairs = await takePairs(pipeline, 0, 5);
    try {
      expect(pairs[0]?.timestamp).toBeCloseTo(0, 3);
      expectLockstep(pairs, SAILING_8K_30);
    } finally {
      closeAll(pairs);
    }
  });
});
