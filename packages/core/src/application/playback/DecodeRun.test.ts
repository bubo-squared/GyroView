import { describe, expect, it } from 'vitest';

import { DecodeRun, type DecodeRunParts } from './DecodeRun';
import type { EncodedVideoPacket } from '../../ports/VideoTrack';
import { Deferred } from '../../shared/async/Deferred';
import { GyroViewError } from '../../shared/errors/GyroViewError';
import { seconds, type Seconds } from '../../shared/units/time';
import { FakeVideoDecoderPort, type FakeFrameHandle } from '../../testing/FakeVideoDecoderPort';
import { FakeMediaBuffer } from '../../testing/FakeMediaBuffer';
import { FakeVideoTrack } from '../../testing/FakeVideoTrack';
import { settle } from '../../../test/support/settle';

function parts(frameCount: number, firstTimestamp = seconds(0)): DecodeRunParts<FakeFrameHandle> {
  return partsQueuing(frameCount, { firstTimestamp, queueCapacity: 4 });
}

function partsQueuing(
  frameCount: number,
  {
    firstTimestamp = seconds(0),
    queueCapacity,
  }: { firstTimestamp?: Seconds; queueCapacity: number },
): DecodeRunParts<FakeFrameHandle> {
  return {
    frameSources: [0, 1].map(
      (trackIndex) =>
        new FakeVideoTrack({
          trackIndex,
          frameRate: 10,
          frameCount,
          framesPerGop: 10,
          firstTimestamp,
        }),
    ),
    decoderPort: new FakeVideoDecoderPort({ latencyTicks: 1 }),
    pipeline: { maxPendingPackets: 3, pairTolerance: seconds(0.0001) },
    queueCapacity,
  };
}

function ignoreProgress(): void {
  // The test reads the queue once everything has settled.
}

function failOnError(error: unknown): never {
  throw error instanceof Error ? error : new Error(String(error));
}

const QUIET = { onProgress: ignoreProgress, onFailure: failOnError };

/**
 * A track whose first packet fails once its gate opens, as a read over a dropped connection.
 */
class LateFailingTrack extends FakeVideoTrack {
  public readonly gate = new Deferred<void>();
  public lookups = 0;

  public override async *packetsFrom(): AsyncIterable<EncodedVideoPacket> {
    this.lookups += 1;
    await this.gate.promise;
    yield* [];
    throw new GyroViewError('source-unreadable', 'the connection dropped');
  }
}

describe('DecodeRun', () => {
  it('queues pairs, tells of each, and is drained once the last is taken', async () => {
    let progress = 0;
    const run = DecodeRun.start(parts(3), seconds(0), {
      onProgress: () => {
        progress += 1;
      },
      onFailure: failOnError,
    });
    await settle();
    expect(progress).toBeGreaterThanOrEqual(3);
    expect(run.isPrimedAt(seconds(0))).toBe(true);
    expect(run.takePairAt(seconds(0))?.timestamp).toBe(0);
    expect(run.isDrained).toBe(false);
    expect(run.takePairAt(seconds(1))?.timestamp).toBeCloseTo(0.2, 9);
    expect(run.isDrained).toBe(true);
    run.abort();
  });

  it('hands out its first pair at once on tracks whose first frame comes later', async () => {
    const run = DecodeRun.start(parts(3, seconds(0.7)), seconds(0), QUIET);
    // A tick before the first pair arrives takes nothing and leaves the first pair due at once.
    expect(run.takePairAt(seconds(0))).toBeUndefined();
    await settle();
    expect(run.takePairAt(seconds(0))?.timestamp).toBeCloseTo(0.7, 9);
    expect(run.takePairAt(seconds(0))).toBeUndefined();
    expect(run.takePairAt(seconds(0.8))?.timestamp).toBeCloseTo(0.8, 9);
    run.abort();
  });

  it('drops what arrives and tells nothing once aborted', async () => {
    let progress = 0;
    const run = DecodeRun.start(parts(3), seconds(0), {
      onProgress: () => {
        progress += 1;
      },
      onFailure: failOnError,
    });
    run.abort();
    await settle();
    expect(progress).toBe(0);
    expect(run.isPrimedAt(seconds(0))).toBe(false);
    expect(run.isDrained).toBe(false);
  });

  it('closes its decoders at once when aborted, their pending packets never decoded', async () => {
    // Slow decoders: closing takes a few microtasks, a picture two hundred.
    const decoderPort = new FakeVideoDecoderPort({ latencyTicks: 200 });
    const run = DecodeRun.start({ ...parts(30), decoderPort }, seconds(0), QUIET);
    const decoders = decoderPort.decodersCreated;
    while (decoders.length < 2 || decoders.some((decoder) => decoder.pendingCount === 0)) {
      await Promise.resolve();
    }
    const decodedBeforeAbort = decoderPort.framesCreated.length;
    run.abort();
    await settle();
    expect(decoderPort.framesCreated).toHaveLength(decodedBeforeAbort);
    expect(decoderPort.openDecoders).toBe(0);
  });

  it('reports no failure of a read that fails after the run was aborted', async () => {
    const track = new LateFailingTrack({
      trackIndex: 0,
      frameRate: 10,
      frameCount: 3,
      framesPerGop: 10,
    });
    const failures: unknown[] = [];
    const run = DecodeRun.start({ ...parts(3), frameSources: [track] }, seconds(0), {
      onProgress: ignoreProgress,
      onFailure: (error) => {
        failures.push(error);
      },
    });
    while (track.lookups === 0) await Promise.resolve();
    run.abort();
    track.gate.resolve();
    await settle();
    expect(failures).toEqual([]);
  });

  it('is primed by a full queue that holds fewer pairs than priming asks for', async () => {
    const run = DecodeRun.start(partsQueuing(10, { queueCapacity: 1 }), seconds(0), QUIET);
    await settle();
    run.takePairAt(seconds(0));
    await settle();
    // One pair left, and a queue of one takes no more: two would never come.
    expect(run.isPrimedAt(seconds(0.1))).toBe(true);
    run.abort();
  });

  it('is starved while nothing is queued and the frame shown lags the clock', async () => {
    const run = DecodeRun.start(parts(3), seconds(0), QUIET);
    expect(run.isStarvedAt(seconds(1), seconds(0.5))).toBe(true);
    expect(run.isStarvedAt(seconds(1), undefined)).toBe(true);
    expect(run.isStarvedAt(seconds(0.6), seconds(0.5))).toBe(false);
    await settle();
    expect(run.isStarvedAt(seconds(1), seconds(0.5))).toBe(false);
    run.takePairAt(seconds(1));
    expect(run.isStarvedAt(seconds(9), seconds(0.2))).toBe(false);
    run.abort();
  });

  it('is ready to resume once primed and its buffer is, or once it reached the end', async () => {
    const buffer = new FakeMediaBuffer(false);
    const run = DecodeRun.start({ ...parts(30), buffer }, seconds(0), QUIET);
    await settle();
    expect(run.isPrimedAt(seconds(0))).toBe(true);
    expect(run.isReadyToResumeAt(seconds(0))).toBe(false);
    buffer.progress(true);
    expect(run.isReadyToResumeAt(seconds(0))).toBe(true);
    run.abort();
    const ended = DecodeRun.start(
      { ...parts(2), buffer: new FakeMediaBuffer(false) },
      seconds(0),
      QUIET,
    );
    await settle();
    expect(ended.isReadyToResumeAt(seconds(0))).toBe(true);
    ended.abort();
  });

  it("tells of its buffer's progress until aborted", async () => {
    const buffer = new FakeMediaBuffer(false);
    let progress = 0;
    const run = DecodeRun.start({ ...parts(30), buffer }, seconds(0), {
      onProgress: () => {
        progress += 1;
      },
      onFailure: failOnError,
    });
    await settle();
    const fromDecoding = progress;
    buffer.progress(false);
    expect(progress).toBe(fromDecoding + 1);
    run.abort();
    expect(buffer.listenerCount).toBe(0);
  });
});
