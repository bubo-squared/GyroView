import { Signal } from '@gyroview/core';

/**
 * A signal that fires after `ms`: the core has no timers, so the host supplies deadlines.
 */
export function deadlineIn(ms: number): Signal {
  const signal = new Signal();
  setTimeout(() => {
    signal.trigger();
  }, ms);
  return signal;
}
