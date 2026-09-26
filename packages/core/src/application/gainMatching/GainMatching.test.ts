import { describe, expect, it } from 'vitest';

import { GainMatching } from './GainMatching';
import { Deferred } from '../../shared/async/Deferred';
import type { Vector3 } from '../../shared/math/Vector3';
import { seconds } from '../../shared/units/time';
import type { SeamMeter } from '../../ports/SeamMeter';

const BRIGHT_AND_DARK: readonly Vector3[] = [
  [0.8, 0.8, 0.8],
  [0.4, 0.4, 0.4],
];

/**
 * A meter under the test's control: each measurement waits until the test answers it.
 */
class ControlledMeter implements SeamMeter {
  public readonly pending: Deferred<readonly Vector3[] | undefined>[] = [];
  public isDisposed = false;

  public measure(): Promise<readonly Vector3[] | undefined> {
    const answer = new Deferred<readonly Vector3[] | undefined>();
    this.pending.push(answer);
    return answer.promise;
  }

  public dispose(): void {
    this.isDisposed = true;
  }
}

function matching(): {
  meter: ControlledMeter;
  applied: (readonly Vector3[])[];
  subject: GainMatching;
} {
  const meter = new ControlledMeter();
  const applied: (readonly Vector3[])[] = [];
  const subject = new GainMatching(meter, (gains) => {
    applied.push(gains);
  });
  return { meter, applied, subject };
}

describe('GainMatching', () => {
  it('measures after the first presented frame and applies the gains the matcher gives', async () => {
    const { meter, applied, subject } = matching();
    subject.afterPresent(seconds(0));
    meter.pending[0]?.resolve(BRIGHT_AND_DARK);
    await subject.matchNow(seconds(0));
    expect(applied).toHaveLength(1);
    expect(applied[0]?.[1]?.[0]).toBeGreaterThan(1);
  });

  it('measures again only once half a second of media has passed', async () => {
    const { meter, subject } = matching();
    subject.afterPresent(seconds(0));
    meter.pending[0]?.resolve(BRIGHT_AND_DARK);
    await subject.matchNow(seconds(0));
    subject.afterPresent(seconds(0.2));
    expect(meter.pending).toHaveLength(1);
    subject.afterPresent(seconds(0.6));
    expect(meter.pending).toHaveLength(2);
  });

  it('joins a measurement already under way instead of starting another', () => {
    const { meter, subject } = matching();
    subject.afterPresent(seconds(0));
    void subject.matchNow(seconds(0));
    expect(meter.pending).toHaveLength(1);
  });

  it('applies nothing when the seam could not be measured', async () => {
    const { meter, applied, subject } = matching();
    const measured = subject.matchNow(seconds(0));
    meter.pending[0]?.resolve(undefined);
    await measured;
    expect(applied).toEqual([]);
  });

  it('ignores a measurement that lands after it stopped, and leaves the meter to its owner', async () => {
    const { meter, applied, subject } = matching();
    const measured = subject.matchNow(seconds(0));
    subject.stop();
    meter.pending[0]?.resolve(BRIGHT_AND_DARK);
    await measured;
    expect(applied).toEqual([]);
    expect(meter.isDisposed).toBe(false);
  });
});
