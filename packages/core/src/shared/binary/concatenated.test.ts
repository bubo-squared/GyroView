import { describe, expect, it } from 'vitest';

import { concatenated } from './concatenated';

describe('concatenated', () => {
  it('puts the parts one after the other, empty ones taking no room', () => {
    const whole = concatenated([Uint8Array.of(1, 2), new Uint8Array(), Uint8Array.of(3)]);
    expect([...whole]).toEqual([1, 2, 3]);
  });
});
