import { describe, expect, it } from 'vitest';

import { RunStop, STOPPED } from './RunStop';

describe('RunStop', () => {
  it('lets a wait finish with its own value while the run goes on', async () => {
    await expect(new RunStop().race(Promise.resolve('segment'))).resolves.toBe('segment');
  });

  it('ends the wait in progress as soon as the run stops', async () => {
    const stop = new RunStop();
    const waiting = stop.race(
      new Promise<string>(() => {
        // Never settles: only the stop can end this wait.
      }),
    );
    stop.stop();
    await expect(waiting).resolves.toBe(STOPPED);
    expect(stop.wasStopped).toBe(true);
  });

  it('does not start a wait once the run has stopped', async () => {
    const stop = new RunStop();
    stop.stop();
    await expect(stop.race(Promise.resolve('segment'))).resolves.toBe(STOPPED);
  });
});
