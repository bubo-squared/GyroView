import { createBrowserPlayer, type Player } from '@gyroview/player';
import { waitFor } from '@gyroview/player/testing';
import { afterEach, describe, expect, it, type TestContext } from 'vitest';

import { NetworkRecorder, type RecordedRequest } from './NetworkRecorder';
import { isServed, OFFICE_5K7_60 } from './sampleUrls';

/**
 * A link with room over the office recording's 210 Mbit/s, so playback keeps up and what each
 * step fetches is the download's own doing, with a round trip to a nearby region.
 */
const LINK = { megabitsPerSecond: 400, latencyMs: 40 };
const MEBIBYTE = 1_048_576;
/**
 * The download's policy for the office recording (ADR 0029): 128 MiB ahead of the picture, the
 * 10 s ahead weighing more, asked for in ranges of 8 MiB, two at a time.
 */
const MOST_AHEAD_BYTES = 128 * MEBIBYTE;
const IN_FLIGHT_BYTES = 2 * 8 * MEBIBYTE;
/**
 * A key frame every 2 s: a seek decodes from up to that far before its target.
 */
const KEY_FRAME_LEAD_SECONDS = 2;
/**
 * A request after the seek that starts this far before the target serves the old position; the
 * margin covers the key frame's lead and the bit rate varying from the file's average, by which
 * a time is turned into bytes here.
 */
const STALE_MARGIN_SECONDS = 10;
/**
 * Over a playback, each byte fetched once, give or take what joins the ranges between them.
 */
const MOST_FETCHED_PER_PLAYED_BYTE = 1.05;
const QUIET_MS = 3000;
const PAUSE_MS = 12_000;
const PLAYED_BEFORE_PAUSE = 3;
const PLAYED_BEFORE_SEEK = 5;
const SEEK_TARGET = 150;
const PLAYED_AFTER_SEEK = 5;
/**
 * How soon after a seek the old position's requests must have ended: the same turn, give or take
 * the abort reaching the recorder.
 */
const ABORTED_WITHIN_MS = 200;
const STEP_TIMEOUT_MS = 60_000;
const TEST_TIMEOUT_MS = 240_000;

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0).toReversed()) cleanup();
});

interface RemotePlayer {
  readonly player: Player;
  readonly recorder: NetworkRecorder;
  readonly fileSize: number;
}

async function remotePlayer(context: TestContext): Promise<RemotePlayer> {
  if (!(await isServed(OFFICE_5K7_60.url))) context.skip('the office recording is not available');
  const canvas = document.createElement('canvas');
  const audio = document.createElement('audio');
  audio.muted = true;
  document.body.append(canvas, audio);
  const recorder = new NetworkRecorder(LINK);
  const player = createBrowserPlayer({ canvas, audio }, { http: { fetch: recorder.fetch } });
  cleanups.push(() => {
    player.dispose();
    canvas.remove();
    audio.remove();
  });
  const head = await fetch(OFFICE_5K7_60.url, { method: 'HEAD' });
  return { player, recorder, fileSize: Number(head.headers.get('content-length')) };
}

function load(player: Player, isPreloading: boolean): Promise<void> {
  const source = { main: { url: OFFICE_5K7_60.url }, second: undefined };
  return player.load(source, { preload: isPreloading });
}

function playedTo(player: Player, time: number, what: string): Promise<void> {
  return waitFor(() => player.currentTime >= time, what, STEP_TIMEOUT_MS);
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function startedAfter(requests: readonly RecordedRequest[], time: number): RecordedRequest[] {
  return requests.filter((request) => request.startedAt >= time);
}

function bytesOf(requests: readonly RecordedRequest[]): number {
  return requests.reduce((total, request) => total + request.bytesReceived, 0);
}

/**
 * The most a stretch of playback may fetch: each byte the playhead passed about once, and what
 * the download read ahead of it and had coming when the stretch ended.
 */
function mostFetchedFor(playedSeconds: number, bytesPerSecond: number): number {
  const played = MOST_FETCHED_PER_PLAYED_BYTE * playedSeconds * bytesPerSecond;
  return played + MOST_AHEAD_BYTES + IN_FLIGHT_BYTES;
}

describe('remote playback of the office recording over a throttled link', () => {
  it(
    'reads nothing more until the first play, with preload on or off',
    async (context) => {
      for (const isPreloading of [false, true]) {
        const { player, recorder } = await remotePlayer(context);
        await load(player, isPreloading);
        await pause(QUIET_MS / 2);
        const settledAt = performance.now();
        await pause(QUIET_MS / 2);
        expect(startedAfter(recorder.requests(), settledAt)).toEqual([]);
      }
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'fetches each byte about once, stops at its budget while paused, and gives a seek the link at once',
    async (context) => {
      const { player, recorder, fileSize } = await remotePlayer(context);
      await load(player, true);
      const bytesPerSecond = fileSize / player.duration;
      const bytesAtOpen = recorder.bytesReceived();
      await player.play();
      await playedTo(player, PLAYED_BEFORE_PAUSE, 'the first seconds');

      player.pause();
      const bytesAtPause = recorder.bytesReceived();
      await pause(PAUSE_MS / 2);
      const quietFrom = performance.now();
      await pause(PAUSE_MS / 2);
      expect(recorder.bytesReceived() - bytesAtPause).toBeLessThanOrEqual(
        MOST_AHEAD_BYTES + IN_FLIGHT_BYTES,
      );
      expect(startedAfter(recorder.requests(), quietFrom), 'requests late in the pause').toEqual(
        [],
      );

      await player.play();
      await playedTo(player, PLAYED_BEFORE_SEEK, 'playing again');
      const bytesAtSeek = recorder.bytesReceived();
      expect(bytesAtSeek - bytesAtOpen).toBeLessThanOrEqual(
        mostFetchedFor(PLAYED_BEFORE_SEEK, bytesPerSecond),
      );

      const seekedAt = performance.now();
      // Ranges alone: a HEAD's empty body is let go of unread, and never looks finished.
      const inFlight = recorder
        .requests()
        .filter((request) => request.range !== undefined && request.finishedAt === undefined);
      player.seek(SEEK_TARGET);
      await playedTo(player, SEEK_TARGET + PLAYED_AFTER_SEEK, 'seconds after the seek');

      const requests = recorder.requests();
      const oldRequests = requests.filter((request) =>
        inFlight.some((old) => old.startedAt === request.startedAt),
      );
      expect(
        oldRequests.every(
          (request) => (request.finishedAt ?? Infinity) <= seekedAt + ABORTED_WITHIN_MS,
        ),
      ).toBe(true);
      const newStart = (SEEK_TARGET - STALE_MARGIN_SECONDS) * bytesPerSecond;
      const afterSeek = startedAfter(requests, seekedAt);
      const stale = afterSeek.filter((request) => (request.range?.start ?? Infinity) < newStart);
      expect(stale, 'requests for the old position').toEqual([]);
      expect(
        afterSeek.filter((request) => request.wasAborted),
        'requests given up again',
      ).toEqual([]);
      expect(bytesOf(afterSeek)).toBeLessThanOrEqual(
        mostFetchedFor(KEY_FRAME_LEAD_SECONDS + PLAYED_AFTER_SEEK, bytesPerSecond),
      );
    },
    TEST_TIMEOUT_MS,
  );
});
