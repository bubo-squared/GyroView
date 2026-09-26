import { describe, expect, it } from 'vitest';

import { DecodeRun, type DecodeRunParts } from './DecodeRun';
import { seconds } from '../../shared/units/time';
import { FakeVideoDecoderPort, type FakeFrameHandle } from '../../testing/FakeVideoDecoderPort';
import { FakeVideoTrack } from '../../testing/FakeVideoTrack';
import { settle } from '../../../test/support/settle';

function parts(frameCount: number, firstTimestamp = seconds(0)): DecodeRunParts<FakeFrameHandle> {
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
    queueCapacity: 4,
  };
}

function ignoreProgress(): void {
  // The test reads the queue once everything has settled.
}

function failOnError(error: unknown): never {
  throw error instanceof Error ? error : new Error(String(error));
}

describe('DecodeRun', () => {
  it('queues pairs, tells of each, and knows when it has decoded everything', async () => {
    let progress = 0;
    const run = DecodeRun.start(parts(3), seconds(0), {
      onProgress: () => {
        progress += 1;
      },
      onFailure: failOnError,
    });
    await settle();
    expect(run.queuedPairs).toBe(3);
    expect(run.hasReachedEnd).toBe(true);
    expect(progress).toBeGreaterThanOrEqual(3);
    expect(run.takePairAt(seconds(0))?.timestamp).toBe(0);
    run.abort();
  });

  it('hands out its first pair at once on tracks whose first frame comes later', async () => {
    const run = DecodeRun.start(parts(3, seconds(0.7)), seconds(0), {
      onProgress: ignoreProgress,
      onFailure: failOnError,
    });
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
    expect(run.queuedPairs).toBe(0);
    expect(run.hasReachedEnd).toBe(false);
  });
});
