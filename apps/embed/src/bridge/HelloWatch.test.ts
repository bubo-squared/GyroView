import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HelloWatch } from './HelloWatch';

const DEADLINE_MS = 1000;

describe('HelloWatch', () => {
  let givenUp: number;
  let watch: HelloWatch;

  beforeEach(() => {
    vi.useFakeTimers();
    givenUp = 0;
    watch = new HelloWatch(DEADLINE_MS, () => {
      givenUp += 1;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('gives up on a frame that loaded and never said hello', () => {
    watch.loaded();
    vi.advanceTimersByTime(DEADLINE_MS - 1);
    expect(givenUp).toBe(0);
    vi.advanceTimersByTime(1);
    expect(givenUp).toBe(1);
  });

  it('takes a hello heard before the load as the answer to that load', () => {
    watch.heard();
    watch.loaded();
    vi.advanceTimersByTime(DEADLINE_MS * 2);
    expect(givenUp).toBe(0);
  });

  it('takes a hello heard in time after the load as its answer', () => {
    watch.loaded();
    vi.advanceTimersByTime(DEADLINE_MS / 2);
    watch.heard();
    vi.advanceTimersByTime(DEADLINE_MS * 2);
    expect(givenUp).toBe(0);
  });

  it('watches each load anew: a hello answers one load only', () => {
    watch.loaded();
    watch.heard();
    watch.loaded();
    vi.advanceTimersByTime(DEADLINE_MS);
    expect(givenUp).toBe(1);
  });

  it('takes a hello heard after giving up as the late answer of that load, not of the next', () => {
    watch.loaded();
    vi.advanceTimersByTime(DEADLINE_MS);
    watch.heard();
    watch.loaded();
    vi.advanceTimersByTime(DEADLINE_MS);
    expect(givenUp).toBe(2);
  });

  it('gives up on nothing once cancelled', () => {
    watch.loaded();
    watch.cancel();
    vi.advanceTimersByTime(DEADLINE_MS * 2);
    expect(givenUp).toBe(0);
  });
});
