import { describe, expect, it } from 'vitest';

import { Deferred } from './Deferred';

describe('Deferred', () => {
  it('settles with the first value and ignores later ones', async () => {
    const deferred = new Deferred<string>();
    expect(deferred.isSettled).toBe(false);
    deferred.resolve('first');
    deferred.resolve('second');
    expect(deferred.isSettled).toBe(true);
    await expect(deferred.promise).resolves.toBe('first');
  });

  it('rejects with the first reason and ignores later settlements', async () => {
    const deferred = new Deferred<string>();
    deferred.reject(new Error('first'));
    deferred.reject(new Error('second'));
    deferred.resolve('late');
    expect(deferred.isSettled).toBe(true);
    await expect(deferred.promise).rejects.toThrow('first');
  });
});
