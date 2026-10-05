import { describe, expect, it } from 'vitest';

import type { FramePair } from '../../ports/FramePair';
import { StartGate } from './StartGate';
import type { DecodedFrame } from '../../ports/VideoDecoderPort';
import { seconds } from '../../shared/units/time';

interface CountingPair extends FramePair<string> {
  readonly closedFrames: () => number;
}

function pairAt(time: number): CountingPair {
  let closed = 0;
  const frames: DecodedFrame<string>[] = ['lens0', 'lens1'].map((handle) => ({
    timestamp: seconds(time),
    handle,
    close: (): void => {
      closed += 1;
    },
  }));
  return { timestamp: seconds(time), frames, closedFrames: () => closed };
}

const TOLERANCE = seconds(0.0005);

function gateAt(from: number): { gate: StartGate<string>; delivered: FramePair<string>[] } {
  const delivered: FramePair<string>[] = [];
  const gate = new StartGate<string>(seconds(from), TOLERANCE, (pair) => {
    delivered.push(pair);
  });
  return { gate, delivered };
}

describe('StartGate', () => {
  it('passes pairs at or after the start straight through', () => {
    const { gate, delivered } = gateAt(1);
    const [atStart, after] = [pairAt(1), pairAt(1.1)];
    gate.push(atStart);
    gate.push(after);
    expect(delivered).toEqual([atStart, after]);
    expect(gate.dropped).toBe(0);
  });

  it('takes a pair a decoder timed a fraction of a microsecond early for the pair at the start', () => {
    const sampleTime = 2002 / 30_000;
    const { gate, delivered } = gateAt(sampleTime);
    const decoded = pairAt(Math.round(sampleTime * 1_000_000) / 1_000_000);
    gate.push(decoded);
    expect(delivered).toEqual([decoded]);
  });

  it('still holds a pair one frame before the start', () => {
    const { gate, delivered } = gateAt(2002 / 30_000);
    gate.push(pairAt(1001 / 30_000));
    expect(delivered).toEqual([]);
  });

  it('holds the newest pair before the start and releases it ahead of the first pair after it', () => {
    const { gate, delivered } = gateAt(1.25);
    const [first, second, third, after] = [pairAt(1), pairAt(1.1), pairAt(1.2), pairAt(1.3)];
    gate.push(first);
    gate.push(second);
    gate.push(third);
    expect(delivered).toEqual([]);
    gate.push(after);
    expect(delivered).toEqual([third, after]);
    expect(gate.dropped).toBe(2);
    expect([first.closedFrames(), second.closedFrames(), third.closedFrames()]).toEqual([2, 2, 0]);
  });

  it('release hands over the held pair once and is otherwise a no-op', () => {
    const { gate, delivered } = gateAt(5);
    const last = pairAt(2.9);
    gate.push(last);
    gate.release();
    gate.release();
    expect(delivered).toEqual([last]);
    expect(last.closedFrames()).toBe(0);
  });

  it('discard closes the held pair without delivering it', () => {
    const { gate, delivered } = gateAt(5);
    const held = pairAt(2.9);
    gate.push(held);
    gate.discard();
    gate.release();
    expect(delivered).toEqual([]);
    expect(held.closedFrames()).toBe(2);
    expect(gate.dropped).toBe(0);
  });
});
