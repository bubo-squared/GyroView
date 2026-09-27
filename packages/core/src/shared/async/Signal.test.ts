import { describe, expect, it } from 'vitest';

import { Signal } from './Signal';

describe('Signal', () => {
  it('resolves its promise once triggered', async () => {
    const signal = new Signal();
    let hasResolved = false;
    void signal.promise.then(() => {
      hasResolved = true;
    });
    await Promise.resolve();
    expect(hasResolved).toBe(false);
    signal.trigger();
    await Promise.resolve();
    expect(hasResolved).toBe(true);
  });

  it('tolerates being triggered twice', () => {
    const signal = new Signal();
    signal.trigger();
    expect(() => {
      signal.trigger();
    }).not.toThrow();
  });
});
