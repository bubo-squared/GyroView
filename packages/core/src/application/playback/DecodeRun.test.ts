import { describe, expect, it } from 'vitest';

import { DecodeRun, type DecodeRunParts } from './DecodeRun';
import { seconds } from '../../shared/units/time';
import { FakeVideoDecoderPort, type FakeFrameHandle } from '../../testing/FakeVideoDecoderPort';
import { FakeVideoTrack } from '../../testing/FakeVideoTrack';
import { settle } from '../../../test/support/sessionHarness';

function parts(frameCount: number): DecodeRunParts<FakeFrameHandle> {
  return {
    frameSources: [0, 1].map(
      (trackIndex) =>
        new FakeVideoTrack({ trackIndex, frameRate: 10, frameCount, framesPerGop: 10 }),
    ),
    decoderPort: new FakeVideoDecoderPort({ latencyTicks: 1 }),
    pipeline: { maxPendingPackets: 3, pairTolerance: seconds(0.0001) },
    queueCapacity: 4,
  };
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
    run.stop();
  });

  it('drops what arrives and tells nothing once stopped', async () => {
    let progress = 0;
    const run = DecodeRun.start(parts(3), seconds(0), {
      onProgress: () => {
        progress += 1;
      },
      onFailure: failOnError,
    });
    run.stop();
    await settle();
    expect(progress).toBe(0);
    expect(run.queuedPairs).toBe(0);
    expect(run.hasReachedEnd).toBe(false);
  });
});
