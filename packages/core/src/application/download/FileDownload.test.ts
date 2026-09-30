import { describe, expect, it } from 'vitest';

import { FileDownload, type CursorSample, type SampleCursor } from './FileDownload';
import type { DownloadPolicy } from '../../domain/download/DownloadPolicy';
import type { TrackSampleTable } from '../../domain/container/TrackSampleTable';
import { GyroViewError } from '../../shared/errors/GyroViewError';
import { seconds } from '../../shared/units/time';
import { cameraRecording, type CameraRecording } from '../../testing/cameraRecording';
import { SimulatedLink } from '../../testing/SimulatedLink';
import { settle } from '../../../test/support/settle';

const FRAME_RATE = 60;
const RECORDING: CameraRecording = cameraRecording({
  frames: 1200,
  frameBytes: 2000,
  soundBytes: 100,
  frameRate: FRAME_RATE,
  framesPerGop: 30,
});
const SLOT = RECORDING.slotBytes;
const POLICY: DownloadPolicy = {
  aheadSeconds: seconds(2),
  aheadBytes: 100 * SLOT,
  keepBehindBytes: 10 * SLOT,
  requestSize: 10 * SLOT,
  requestsInFlight: 2,
  bridgedGap: 2 ** 20,
  refillBytes: 25 * SLOT,
};
/**
 * A tick is a frame's time: the link carries half again what playing takes, after two frames.
 */
const NETWORK = { bytesPerTick: Math.round(1.5 * SLOT), latencyTicks: 2 };
const STALLED = Symbol('stalled');

async function stalled(): Promise<typeof STALLED> {
  await settle();
  return STALLED;
}

interface Setup {
  readonly link: SimulatedLink;
  readonly download: FileDownload;
}

function setup(policy = POLICY): Setup {
  const link = new SimulatedLink(new Uint8Array(RECORDING.fileSize), NETWORK);
  return { link, download: new FileDownload({ table: RECORDING.table, stream: link, policy }) };
}

function tracks(): TrackSampleTable[] {
  return [RECORDING.lens0, RECORDING.sound, RECORDING.lens1];
}

/**
 * Readers taking their samples as playing would: every sample due by the playhead whose bytes
 * have come, a read that waits left waiting until the next look.
 */
class Readers {
  public handedOutBytes = 0;
  private readonly waiting = new Map<SampleCursor, Promise<CursorSample | undefined>>();

  public constructor(public readonly cursors: readonly SampleCursor[]) {}

  public async takeDueBy(time: number): Promise<void> {
    for (const cursor of this.cursors) await this.takeFrom(cursor, time);
  }

  private async takeFrom(cursor: SampleCursor, time: number): Promise<void> {
    while (
      cursor.position < cursor.track.sampleCount &&
      cursor.track.timestampOf(cursor.position) <= time
    ) {
      const next = this.waiting.get(cursor) ?? cursor.nextSample();
      const result = await Promise.race([next, stalled()]);
      if (result === STALLED) {
        this.waiting.set(cursor, next);
        return;
      }
      this.waiting.delete(cursor);
      if (!result) return;
      this.handedOutBytes += result.bytes.byteLength;
    }
  }
}

function openReaders(download: FileDownload, frame: number): Readers {
  return new Readers(tracks().map((track) => download.openCursor(track, frame)));
}

/**
 * Plays from `startFrame` for `frames` ticks, the link carrying its bytes tick by tick.
 */
async function play(
  context: Setup & { readonly readers: Readers },
  startFrame: number,
  frames: number,
): Promise<void> {
  for (let tick = 0; tick <= frames; tick += 1) {
    context.link.advance();
    await settle();
    await context.readers.takeDueBy((startFrame + tick) / FRAME_RATE);
  }
}

async function idle(link: SimulatedLink, ticks: number): Promise<void> {
  for (let tick = 0; tick < ticks; tick += 1) {
    link.advance();
    await settle();
  }
}

describe('FileDownload', () => {
  it("hands each reader its track's samples in order as their bytes come", async () => {
    const context = setup();
    const readers = openReaders(context.download, 0);
    context.download.startReadingAhead();
    await play({ ...context, readers }, 0, 30);
    expect(readers.cursors.map((cursor) => cursor.position)).toEqual([31, 31, 31]);
  });

  it('before playing, reads only the frames the picture waits for', async () => {
    const context = setup();
    const readers = openReaders(context.download, 0);
    await play({ ...context, readers }, 0, 3);
    await idle(context.link, 200);
    expect(context.link.deliveredBytes).toBeLessThanOrEqual(5 * SLOT);
  });

  it('while paused, reads ahead to its budget and then stops', async () => {
    const context = setup();
    const readers = openReaders(context.download, 0);
    context.download.startReadingAhead();
    await play({ ...context, readers }, 0, 1);
    await idle(context.link, 400);
    const requestsAtRest = context.link.requests.length;
    await idle(context.link, 200);
    expect(context.link.deliveredBytes).toBeLessThanOrEqual(POLICY.aheadBytes + 2 * SLOT);
    expect(context.link.requests).toHaveLength(requestsAtRest);
  });

  it('fetches about each byte it hands out once, playing the recording through', async () => {
    const context = setup();
    const readers = openReaders(context.download, 0);
    context.download.startReadingAhead();
    await play({ ...context, readers }, 0, 1300);
    expect(readers.handedOutBytes).toBe(RECORDING.fileSize);
    expect(context.link.deliveredBytes / readers.handedOutBytes).toBeLessThanOrEqual(1.05);
  });

  it('on a seek, gives up what the old position still reads and asks for nothing below the new one', async () => {
    const context = setup();
    const before = openReaders(context.download, 0);
    context.download.startReadingAhead();
    await play({ ...context, readers: before }, 0, 60);
    const requestsBefore = context.link.requests.length;
    for (const cursor of before.cursors) cursor.close();
    const after = openReaders(context.download, 600);
    await settle();
    const oldRequests = context.link.requests.slice(0, requestsBefore);
    expect(oldRequests.every((request) => request.endedAt !== undefined)).toBe(true);
    await play({ ...context, readers: after }, 600, 60);
    const newRequests = context.link.requests.slice(requestsBefore);
    expect(newRequests.every((request) => request.range.offset >= 600 * SLOT)).toBe(true);
    expect(after.cursors.map((cursor) => cursor.position)).toEqual([661, 661, 661]);
  });

  it('wastes on a seek no more than what it read ahead and had coming', async () => {
    const context = setup();
    const before = openReaders(context.download, 0);
    context.download.startReadingAhead();
    await play({ ...context, readers: before }, 0, 120);
    for (const cursor of before.cursors) cursor.close();
    const deliveredAtSeek = context.link.deliveredBytes;
    const after = openReaders(context.download, 900);
    await play({ ...context, readers: after }, 900, 120);
    const unused = deliveredAtSeek - before.handedOutBytes;
    expect(unused).toBeLessThanOrEqual(
      POLICY.aheadBytes + POLICY.requestsInFlight * POLICY.requestSize,
    );
    expect(
      context.link.deliveredBytes - deliveredAtSeek - after.handedOutBytes,
    ).toBeLessThanOrEqual(POLICY.aheadBytes + POLICY.requestsInFlight * POLICY.requestSize);
  });

  it('fails the reader waiting on a range that failed', async () => {
    const context = setup();
    const error = new GyroViewError('source-unreadable', 'the connection dropped');
    context.link.failWhere((range) => range.end > 50 * SLOT, error);
    const cursor = context.download.openCursor(RECORDING.lens0, 60);
    const failed = expect(cursor.nextSample()).rejects.toBe(error);
    await idle(context.link, 5);
    await failed;
  });

  it('serves several readers of one track at once', async () => {
    const context = setup();
    const near = context.download.openCursor(RECORDING.lens0, 0);
    const far = context.download.openCursor(RECORDING.lens0, 300);
    const samples = Promise.all([near.nextSample(), far.nextSample()]);
    await idle(context.link, 10);
    const [first, second] = await samples;
    expect([first?.sample, second?.sample]).toEqual([0, 300]);
  });

  it('once disposed, gives every range up and ends every reader', async () => {
    const context = setup();
    const cursor = context.download.openCursor(RECORDING.lens0, 0);
    context.download.startReadingAhead();
    const next = cursor.nextSample();
    await idle(context.link, 1);
    context.download.dispose();
    await expect(next).resolves.toBeUndefined();
    await idle(context.link, 5);
    expect(context.link.requests.every((request) => request.endedAt !== undefined)).toBe(true);
  });
});
