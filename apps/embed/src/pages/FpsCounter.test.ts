import { describe, expect, it } from 'vitest';

import { FpsCounter } from './FpsCounter';

describe('FpsCounter', () => {
  it('counts the frames of the last second only', () => {
    const counter = new FpsCounter();
    for (let frame = 0; frame < 30; frame += 1) counter.record(frame * 33);
    expect(counter.rateAt(30 * 33)).toBe(30);
    expect(counter.rateAt(30 * 33 + 500)).toBe(15);
    expect(counter.rateAt(5000)).toBe(0);
  });
});
