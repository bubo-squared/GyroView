import { describe, expect, it } from 'vitest';

import { lazy } from './lazy';

describe('lazy', () => {
  it('makes the value on the first request only, an undefined one included', () => {
    let calls = 0;
    const value = lazy(() => {
      calls += 1;
      return calls > 1 ? 'again' : undefined;
    });
    expect(calls).toBe(0);
    expect(value()).toBeUndefined();
    expect(value()).toBeUndefined();
    expect(calls).toBe(1);
  });
});
