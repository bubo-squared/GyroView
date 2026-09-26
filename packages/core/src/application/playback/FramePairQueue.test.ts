import { describe, expect, it } from 'vitest';

import type { FramePair } from '../../ports/FramePair';
import { FramePairQueue } from './FramePairQueue';
import { seconds } from '../../shared/units/time';
import { captureError } from '../../../test/support/errors';

interface Probe {
  readonly closed: () => boolean;
}

function pair(timestamp: number): FramePair<Probe> {
  let isClosed = false;
  return {
    timestamp: seconds(timestamp),
    frames: [
      {
        timestamp: seconds(timestamp),
        handle: { closed: () => isClosed },
        close: (): void => {
          isClosed = true;
        },
      },
    ],
  };
}

function isClosed(candidate: FramePair<Probe>): boolean {
  return candidate.frames.every((frame) => frame.handle.closed());
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('FramePairQueue', () => {
  it('hands over the latest pair due at a time, closes skipped older pairs, keeps newer ones', () => {
    const queue = new FramePairQueue<Probe>(4);
    const [first, second, third] = [pair(0), pair(1), pair(2)];
    queue.push(first);
    queue.push(second);
    queue.push(third);
    expect(queue.takePairAt(seconds(1.5))).toBe(second);
    expect(isClosed(first)).toBe(true);
    expect(isClosed(second)).toBe(false);
    expect(queue.length).toBe(1);
    expect(queue.peekTimestamp()).toBe(2);
  });

  it('returns undefined while no queued pair is due', () => {
    const queue = new FramePairQueue<Probe>(2);
    queue.push(pair(1));
    expect(queue.takePairAt(seconds(0.5))).toBeUndefined();
    expect(queue.length).toBe(1);
  });

  it('blocks the producer while full and releases it when a pair is taken', async () => {
    const queue = new FramePairQueue<Probe>(1);
    queue.push(pair(0));
    let hasRoom = false;
    void queue.waitForRoom().then(() => {
      hasRoom = true;
    });
    await settle();
    expect(hasRoom).toBe(false);
    queue.takePairAt(seconds(0));
    await settle();
    expect(hasRoom).toBe(true);
    expect(() => {
      queue.push(pair(1));
    }).not.toThrow();
  });

  it('releases a waiting producer when cleared', async () => {
    const queue = new FramePairQueue<Probe>(1);
    queue.push(pair(0));
    let hasRoom = false;
    void queue.waitForRoom().then(() => {
      hasRoom = true;
    });
    queue.clear();
    await settle();
    expect(hasRoom).toBe(true);
  });

  it('resolves waitForRoom immediately when there is room or the queue is closed', async () => {
    const roomy = new FramePairQueue<Probe>(2);
    await expect(roomy.waitForRoom()).resolves.toBeUndefined();
    const closed = new FramePairQueue<Probe>(1);
    closed.push(pair(0));
    closed.close();
    await expect(closed.waitForRoom()).resolves.toBeUndefined();
  });

  it('accepts pairs beyond the soft capacity so frames already in flight always land', () => {
    const queue = new FramePairQueue<Probe>(1);
    queue.push(pair(0));
    queue.push(pair(1));
    expect(queue.length).toBe(2);
    expect(queue.isFull).toBe(true);
  });

  it('closes and drops everything on clear, and closes pushes after close', () => {
    const queue = new FramePairQueue<Probe>(3);
    const [first, second] = [pair(0), pair(1)];
    queue.push(first);
    queue.push(second);
    queue.clear();
    expect(queue.length).toBe(0);
    expect(isClosed(first) && isClosed(second)).toBe(true);
    queue.close();
    const late = pair(2);
    queue.push(late);
    expect(isClosed(late)).toBe(true);
    expect(queue.isClosedForGood).toBe(true);
  });

  it('rejects a non-positive capacity', () => {
    expect(captureError(() => new FramePairQueue(0))).toMatchObject({
      code: 'invariant-violation',
    });
  });

  it('tells its observer about every pair kept, never about pushes after closing', () => {
    let pushes = 0;
    const queue = new FramePairQueue<Probe>(2, () => {
      pushes += 1;
    });
    queue.push(pair(0));
    queue.push(pair(1));
    expect(pushes).toBe(2);
    queue.close();
    queue.push(pair(2));
    expect(pushes).toBe(2);
  });
});
