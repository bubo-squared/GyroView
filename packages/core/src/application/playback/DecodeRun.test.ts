import { describe, expect, it } from 'vitest';

import { DecodeRun, type DecodeRunParts } from './DecodeRun';
import { seconds, type Seconds } from '../../shared/units/time';
import { FakeVideoDecoderPort, type FakeFrameHandle } from '../../testing/FakeVideoDecoderPort';
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
});
