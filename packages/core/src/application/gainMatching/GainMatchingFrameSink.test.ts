import { describe, expect, it } from 'vitest';

import { GainMatchingFrameSink } from './GainMatchingFrameSink';
import type { SeamMeter } from '../../ports/SeamMeter';
import type { Vector3 } from '../../shared/math/Vector3';
import { seconds } from '../../shared/units/time';
import { FakeFrameSink } from '../../testing/FakeFrameSink';

const BRIGHT_AND_DARK: readonly Vector3[] = [
  [0.8, 0.8, 0.8],
  [0.4, 0.4, 0.4],
];

/**
 * A renderer whose seam always reads bright on lens 0 and dark on lens 1.
 */
class FakeRenderer {
  public readonly lensCount = 2;
  public readonly meters: { isDisposed: boolean }[] = [];
  public readonly applied: (readonly Vector3[])[] = [];

  public createSeamMeter(): SeamMeter {
    const meter = { isDisposed: false };
    this.meters.push(meter);
    return {
      measure: (): Promise<readonly Vector3[]> => Promise.resolve(BRIGHT_AND_DARK),
      dispose: (): void => {
        meter.isDisposed = true;
      },
    };
  }

  public setLensGains(gains: readonly Vector3[]): void {
    this.applied.push(gains);
  }
}

function subject(): {
  sink: FakeFrameSink<string>;
  renderer: FakeRenderer;
  matching: GainMatchingFrameSink<string>;
} {
  const sink = new FakeFrameSink<string>();
  const renderer = new FakeRenderer();
  return { sink, renderer, matching: new GainMatchingFrameSink(sink, renderer) };
}

function presentAt(matching: GainMatchingFrameSink<string>, time: number): void {
  matching.present({ pair: { timestamp: seconds(time), frames: [] }, mediaTime: seconds(time) });
}

describe('GainMatchingFrameSink', () => {
  it('hands every pair to the sink and measures nothing until enabled', async () => {
    const { sink, renderer, matching } = subject();
    presentAt(matching, 0);
    await matching.matchNow();
    expect(sink.presentations).toHaveLength(1);
    expect(renderer.meters).toEqual([]);
    expect(renderer.applied).toEqual([]);
  });

  it('once enabled, matches the gains after a presented pair and on request', async () => {
    const { renderer, matching } = subject();
    matching.enable();
    presentAt(matching, 0);
    await matching.matchNow();
    expect(renderer.applied).toHaveLength(1);
    expect(renderer.applied[0]?.[1]?.[0]).toBeGreaterThan(1);
  });

  it('has nothing to match before the first pair', async () => {
    const { renderer, matching } = subject();
    matching.enable();
    await matching.matchNow();
    expect(renderer.applied).toEqual([]);
  });

  it('releases its meter when disabled or disposed, and takes a fresh one when enabled again', () => {
    const { renderer, matching } = subject();
    matching.enable();
    matching.enable();
    matching.disable();
    matching.enable();
    matching.dispose();
    expect(renderer.meters).toEqual([{ isDisposed: true }, { isDisposed: true }]);
  });

  it('puts the recorded exposure back when disabled', async () => {
    const { renderer, matching } = subject();
    matching.enable();
    presentAt(matching, 0);
    await matching.matchNow();
    matching.disable();
    expect(renderer.applied.at(-1)).toEqual([
      [1, 1, 1],
      [1, 1, 1],
    ]);
  });
});
