import { describe, expect, it } from 'vitest';

import { pacingSummaryOf, type DecodedRecord, type TickRecord } from './pacingSummary';

const FRAME_RATE = 50;
const FRAME_MS = 20;
const FRAME_MICROSECONDS = 20_000;

/**
 * A tick at `start` that drew the pair of `timestamp`, two lenses of 4 ms each, its GPU done
 * 12 ms after it ended.
 */
function drawingTick(start: number, timestamp: number): TickRecord {
  return {
    frameTime: start,
    start,
    end: start + 1,
    clock: start / 1000,
    uploads: [
      { timestamp, ms: 4 },
      { timestamp, ms: 4 },
    ],
    mipmapMs: 0.5,
    canvasDraws: 1,
    gpuDoneAt: start + 13,
  };
}

function idleTick(start: number): TickRecord {
  return { ...drawingTick(start, 0), uploads: [], gpuDoneAt: undefined };
}

describe('pacingSummaryOf', () => {
  it('counts the pairs drawn a second and the pairs never drawn between them', () => {
    const frames = [0, 1, 2, 5, 6];
    const ticks = frames.map((frame) => drawingTick(frame * FRAME_MS, frame * FRAME_MICROSECONDS));
    const summary = pacingSummaryOf({ ticks, decoded: [], frameRate: FRAME_RATE });
    expect(summary.pairsPerSecond).toBeCloseTo(4 / 0.12, 9);
    expect(summary.skippedPairs).toBe(2);
  });

  it('skips no pair where the display holds one for two refreshes, nor at a seek back', () => {
    const frames = [0, 1, 2, 3, 0, 1];
    const starts = [0, 17, 50, 67, 84, 100];
    const ticks = frames.map((frame, index) =>
      drawingTick(starts[index] ?? 0, frame * FRAME_MICROSECONDS),
    );
    expect(pacingSummaryOf({ ticks, decoded: [], frameRate: FRAME_RATE }).skippedPairs).toBe(0);
  });

  it('leaves out the ticks that drew nothing new', () => {
    const ticks = [drawingTick(0, 0), idleTick(10), drawingTick(FRAME_MS, 1)];
    const summary = pacingSummaryOf({ ticks, decoded: [], frameRate: FRAME_RATE });
    expect(summary.pairsPerSecond).toBeCloseTo(50, 9);
    expect(summary.uploadMs.median).toBe(8);
    expect(summary.gpuMs.median).toBe(12);
    expect(summary.tickMs.median).toBe(1);
  });

  it("times a pair's wait from the later of its lenses leaving the decoder", () => {
    const decoded: DecodedRecord[] = [
      { at: 50, timestamp: 7 },
      { at: 70, timestamp: 7 },
    ];
    const summary = pacingSummaryOf({
      ticks: [drawingTick(200, 7)],
      decoded,
      frameRate: FRAME_RATE,
    });
    expect(summary.decodeLeadMs.median).toBe(130);
    expect(summary.pairsPerSecond).toBe(0);
  });
});
