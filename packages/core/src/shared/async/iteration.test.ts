import { describe, expect, it } from 'vitest';

import { Ending, ITERATION_END } from './iteration';

describe('iteration', () => {
  it('ends an iteration once told, and answers with its end', () => {
    const ending = new Ending();
    expect(ending.hasEnded()).toBe(false);
    ending.end();
    expect(ending.hasEnded()).toBe(true);
    expect(ITERATION_END).toEqual({ done: true, value: undefined });
  });
});
