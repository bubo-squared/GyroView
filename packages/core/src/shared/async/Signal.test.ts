import { describe, expect, it } from 'vitest';

import { Signal } from './Signal';

describe('Signal', () => {
  it('resolves its promise once triggered and remembers that it was', async () => {
    const signal = new Signal();
    expect(signal.wasTriggered).toBe(false);
    let hasResolved = false;
    void signal.promise.then(() => {
      hasResolved = true;
    });
    await Promise.resolve();
    expect(hasResolved).toBe(false);
    signal.trigger();
    await Promise.resolve();
    expect(hasResolved).toBe(true);
    expect(signal.wasTriggered).toBe(true);
  });

  it('tolerates being triggered twice', () => {
    const signal = new Signal();
    signal.trigger();
    expect(() => {
      signal.trigger();
    }).not.toThrow();
  });
});
