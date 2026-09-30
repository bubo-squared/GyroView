import { hasErrorCode } from '@gyroview/core';
import { createBrowserPlayer, type Player } from '@gyroview/player';
import { waitFor } from '@gyroview/player/testing';
import { afterEach, describe, expect, it, type TestContext } from 'vitest';

import { saveMeasurement } from '../browser/artifacts';
import { NetworkRecorder, type RecordedRequest } from '../browser/NetworkRecorder';
import { isServed, OFFICE_5K7_60 } from '../browser/sampleUrls';

/**
 * A link like the one the office recording was first played over from S3: close to the
 * recording's own 210 Mbit/s, with a round trip to a nearby region.
 */
const LINK = { megabitsPerSecond: 200, latencyMs: 40 };
const PLAYED_BEFORE_PAUSE = 3;
const PAUSE_MS = 20_000;
const SEEK_TARGET = 150;
/**
 * A request after the seek that starts this far before the target's bytes serves the old
 * position: the key frame before the target lies at most 2 s back.
 */
const STALE_MARGIN = 10;
const PLAYED_AFTER_SEEK = 5;
/**
 * How far the clock must have run past a time to be taken for playing from it.
 */
const CLOCK_RUNNING_SECONDS = 0.05;
const STEP_TIMEOUT_MS = 120_000;
const MEASUREMENT_TIMEOUT_MS = 600_000;
const MEGABYTE = 1_000_000;

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0).toReversed()) cleanup();
});

interface RemotePlayer {
  readonly player: Player;
  readonly duration: number;
}

/**
 * The player a page makes, over the link: the element's own composition, the downloads reading
 * ahead once it plays.
 */
async function openOverTheLink(
  context: TestContext,
  recorder: NetworkRecorder,
): Promise<RemotePlayer> {
  if (!(await isServed(OFFICE_5K7_60.url))) context.skip('the office recording is not available');
  const canvas = document.createElement('canvas');
  const audio = document.createElement('audio');
  audio.muted = true;
  document.body.append(canvas, audio);
  const player = createBrowserPlayer({ canvas, audio }, { http: { fetch: recorder.fetch } });
  cleanups.push(() => {
    player.dispose();
    canvas.remove();
    audio.remove();
  });
  try {
    await player.load({ main: { url: OFFICE_5K7_60.url }, second: undefined });
  } catch (error) {
    if (hasErrorCode(error, 'codec-unsupported')) context.skip('no HEVC decoder in this build');
    throw error;
  }
  return { player, duration: player.duration };
}

function playedTo(player: Player, time: number, what: string): Promise<void> {
  return waitFor(() => player.currentTime >= time, what, STEP_TIMEOUT_MS);
}

/**
 * The requests for byte ranges: a HEAD's empty body is let go of unread, and never looks finished.
 */
function rangeRequests(recorder: NetworkRecorder): RecordedRequest[] {
  return recorder.requests().filter((request) => request.range !== undefined);
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
      const { player, duration } = await openOverTheLink(context, recorder);
      const head = await fetch(OFFICE_5K7_60.url, { method: 'HEAD' });
      const fileSize = Number(head.headers.get('content-length'));
      const bytesPerSecond = fileSize / duration;
      const bytesAtOpen = recorder.bytesReceived();

      const playStartedAt = performance.now();
      await player.play();
      await playedTo(player, PLAYED_BEFORE_PAUSE, 'the first seconds');
      const firstPlayMs = performance.now() - playStartedAt;

      player.pause();
      const pausedAt = performance.now();
      const bytesAtPause = recorder.bytesReceived();
      await pause(PAUSE_MS);
      const resumedAt = performance.now();
      const bytesWhilePaused = recorder.bytesReceived() - bytesAtPause;
      const lastByteWhilePausedMs =
        Math.max(
          pausedAt,
          ...rangeRequests(recorder)
            .map((request) => request.finishedAt ?? resumedAt)
            .filter((finishedAt) => finishedAt <= resumedAt),
        ) - pausedAt;

      await player.play();
      await playedTo(player, PLAYED_BEFORE_PAUSE + 1, 'playing again');
      const bytesBeforeSeek = recorder.bytesReceived();
      const seekedAt = performance.now();
      const inFlightAtSeek = inFlightAt(rangeRequests(recorder), seekedAt);
      player.seek(SEEK_TARGET);
      // The seek puts the clock at the target at once; it runs on once the frames there are shown.
      await playedTo(player, SEEK_TARGET + CLOCK_RUNNING_SECONDS, 'a frame at the seek target');
      const firstFrameAfterSeekMs = performance.now() - seekedAt;
      const bytesUntilFirstFrame = recorder.bytesReceived() - bytesBeforeSeek;
      await playedTo(player, SEEK_TARGET + PLAYED_AFTER_SEEK, 'seconds after the seek');
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
