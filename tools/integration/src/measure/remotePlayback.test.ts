import { hasErrorCode, PlaybackSession, seconds, type Seconds } from '@gyroview/core';
import { FakeFrameSink } from '@gyroview/core/testing';
import {
  browserPorts,
  DECODE_PIPELINE_OPTIONS,
  openRecording,
  PAIR_QUEUE_CAPACITY,
  type OpenedRecording,
} from '@gyroview/player/composition';
import { waitFor } from '@gyroview/player/testing';
import { afterEach, describe, expect, it, type TestContext } from 'vitest';

import { saveMeasurement } from '../browser/artifacts';
import { NetworkRecorder, type RecordedRequest } from '../browser/NetworkRecorder';
import { openAudioClock, startTicking } from '../browser/playbackChecks';
import { isServed, OFFICE_5K7_60 } from '../browser/sampleUrls';

/**
 * A link like the one the office recording was first played over from S3: close to the
 * recording's own 210 Mbit/s, with a round trip to a nearby region.
 */
const LINK = { megabitsPerSecond: 200, latencyMs: 40 };
const PLAYED_BEFORE_PAUSE = seconds(3);
const PAUSE_MS = 20_000;
const SEEK_TARGET = seconds(150);
/**
 * A request after the seek that starts this far before the target's bytes serves the old
 * position: the key frame before the target lies at most 2 s back.
 */
const STALE_MARGIN = seconds(10);
const PLAYED_AFTER_SEEK = seconds(5);
const STEP_TIMEOUT_MS = 120_000;
const MEASUREMENT_TIMEOUT_MS = 600_000;
const MEGABYTE = 1_000_000;

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0).toReversed()) cleanup();
});

interface Playback {
  readonly session: PlaybackSession<VideoFrame>;
  readonly sink: FakeFrameSink<VideoFrame>;
}

type Ports = ReturnType<typeof browserPorts>;

async function openOverTheLink(context: TestContext, ports: Ports): Promise<OpenedRecording> {
  if (!(await isServed(OFFICE_5K7_60.url))) context.skip('the office recording is not available');
  const controller = new AbortController();
  const source = { main: { url: OFFICE_5K7_60.url }, second: undefined };
  try {
    const opened = await openRecording(source, ports, controller.signal);
    cleanups.push(() => {
      controller.abort();
      opened.dispose();
    });
    return opened;
  } catch (error) {
    if (hasErrorCode(error, 'codec-unsupported')) context.skip('no HEVC decoder in this build');
    throw error;
  }
}

async function playbackOf(opened: OpenedRecording, ports: Ports): Promise<Playback> {
  const clock = await openAudioClock(opened, cleanups);
  const sink = new FakeFrameSink<VideoFrame>();
  const session = new PlaybackSession<VideoFrame>({
    frameSources: opened.frameSources,
    decoderPort: ports.decoderPort,
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
  return { session, sink };
}

function playedTo(playback: Playback, time: Seconds, what: string): Promise<void> {
  return waitFor(() => (playback.sink.lastTimestamp ?? 0) >= time, what, STEP_TIMEOUT_MS);
}

function megabytes(bytes: number): number {
  return Math.round(bytes / MEGABYTE);
}

function bytesOf(requests: readonly RecordedRequest[]): number {
  return requests.reduce((total, request) => total + request.bytesReceived, 0);
}

function startedIn(
  requests: readonly RecordedRequest[],
  from: number,
  to: number,
): RecordedRequest[] {
  return requests.filter((request) => request.startedAt >= from && request.startedAt < to);
}

function inFlightAt(requests: readonly RecordedRequest[], time: number): RecordedRequest[] {
  return requests.filter(
    (request) => request.startedAt < time && (request.finishedAt ?? Infinity) > time,
  );
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('remote playback of the office recording over a 200 Mbit/s link', () => {
  it(
    'measures what playing, pausing and seeking fetch',
    async (context) => {
      const recorder = new NetworkRecorder(LINK);
      const ports = browserPorts({ http: { fetch: recorder.fetch } });
      const opened = await openOverTheLink(context, ports);
      const head = await fetch(OFFICE_5K7_60.url, { method: 'HEAD' });
      const fileSize = Number(head.headers.get('content-length'));
      const bytesPerSecond = fileSize / opened.duration;
      const bytesAtOpen = recorder.bytesReceived();
      const playback = await playbackOf(opened, ports);

      const playStartedAt = performance.now();
      await playback.session.play();
      await playedTo(playback, PLAYED_BEFORE_PAUSE, 'the first seconds');
      const firstPlayMs = performance.now() - playStartedAt;

      playback.session.pause();
      const pausedAt = performance.now();
      const bytesAtPause = recorder.bytesReceived();
      await pause(PAUSE_MS);
      const resumedAt = performance.now();
      const bytesWhilePaused = recorder.bytesReceived() - bytesAtPause;
      const lastByteWhilePausedMs =
        Math.max(
          pausedAt,
          ...recorder
            .requests()
            .map((request) => request.finishedAt ?? resumedAt)
            .filter((finishedAt) => finishedAt <= resumedAt),
        ) - pausedAt;

      await playback.session.play();
      await playedTo(playback, seconds(PLAYED_BEFORE_PAUSE + 1), 'playing again');
      const bytesBeforeSeek = recorder.bytesReceived();
      const seekedAt = performance.now();
      const inFlightAtSeek = inFlightAt(recorder.requests(), seekedAt);
      playback.session.seek(SEEK_TARGET);
      await playedTo(playback, SEEK_TARGET, 'a frame at the seek target');
      const firstFrameAfterSeekMs = performance.now() - seekedAt;
      const bytesUntilFirstFrame = recorder.bytesReceived() - bytesBeforeSeek;
      await playedTo(playback, seconds(SEEK_TARGET + PLAYED_AFTER_SEEK), 'seconds after the seek');
      const finishedAt = performance.now();

      const requests = recorder.requests();
      const staleBelow = (SEEK_TARGET - STALE_MARGIN) * bytesPerSecond;
      const afterSeek = startedIn(requests, seekedAt, finishedAt);
      const stale = afterSeek.filter((request) => (request.range?.start ?? Infinity) < staleBelow);
      const mediaPlayed = PLAYED_BEFORE_PAUSE + 1 + PLAYED_AFTER_SEEK;
      const playbackBytes = recorder.bytesReceived() - bytesAtOpen;
      const measurement = {
        link: LINK,
        recordingMegabitsPerSecond: Math.round((bytesPerSecond * 8) / MEGABYTE),
        openMegabytes: megabytes(bytesAtOpen),
        firstPlayMs: Math.round(firstPlayMs),
        pause: {
          megabytesFetched: megabytes(bytesWhilePaused),
          requestsStarted: startedIn(requests, pausedAt, resumedAt).length,
          lastByteAfterMs: Math.round(lastByteWhilePausedMs),
        },
        seek: {
          inFlightAtSeek: inFlightAtSeek.length,
          staleRequestsStarted: stale.length,
          staleMegabytes: megabytes(bytesOf(stale)),
          megabytesUntilFirstFrame: megabytes(bytesUntilFirstFrame),
          firstFrameAfterMs: Math.round(firstFrameAfterSeekMs),
        },
        playback: {
          secondsOfMediaPlayed: mediaPlayed,
          megabytesFetched: megabytes(playbackBytes),
          fetchedPerPlayedByteIncludingPause: Number(
            (playbackBytes / (mediaPlayed * bytesPerSecond)).toFixed(2),
          ),
          requests: requests.length,
          abortedRequests: requests.filter((request) => request.wasAborted).length,
        },
      };
      await saveMeasurement('remote-playback', measurement);
      expect(requests.length).toBeGreaterThan(0);
    },
    MEASUREMENT_TIMEOUT_MS,
  );
});
