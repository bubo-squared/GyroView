import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { IdleWatcher } from './IdleWatcher';

const IDLE_AFTER_MS = 2500;

describe('IdleWatcher', () => {
  let element: HTMLElement;
  let isPlaying: boolean;
  let watcher: IdleWatcher;

  beforeEach(() => {
    vi.useFakeTimers();
    element = document.createElement('div');
    document.body.append(element);
    isPlaying = true;
    watcher = new IdleWatcher(element, () => isPlaying);
    watcher.start();
  });

  afterEach(() => {
    watcher.stop();
    element.remove();
    vi.useRealTimers();
  });

  it('marks the element idle once the viewer has left it alone for a while', () => {
    vi.advanceTimersByTime(IDLE_AFTER_MS - 1);
    expect(element.dataset['idle']).toBeUndefined();
    vi.advanceTimersByTime(1);
    expect(element.dataset['idle']).toBe('');
  });

  it('wakes the element on any activity and waits the whole while again', () => {
    vi.advanceTimersByTime(IDLE_AFTER_MS);
    element.dispatchEvent(new PointerEvent('pointermove'));
    expect(element.dataset['idle']).toBeUndefined();
    vi.advanceTimersByTime(IDLE_AFTER_MS - 1);
    expect(element.dataset['idle']).toBeUndefined();
  });

  it('never marks a paused element idle, and shows it at once when playback pauses', () => {
    vi.advanceTimersByTime(IDLE_AFTER_MS);
    isPlaying = false;
    watcher.refresh();
    expect(element.dataset['idle']).toBeUndefined();
    vi.advanceTimersByTime(IDLE_AFTER_MS);
    expect(element.dataset['idle']).toBeUndefined();
  });

  it('stops listening and clears the mark when stopped', () => {
    vi.advanceTimersByTime(IDLE_AFTER_MS);
    watcher.stop();
    expect(element.dataset['idle']).toBeUndefined();
    vi.advanceTimersByTime(IDLE_AFTER_MS);
    expect(element.dataset['idle']).toBeUndefined();
  });
});
