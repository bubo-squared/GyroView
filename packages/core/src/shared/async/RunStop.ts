export const STOPPED = Symbol('stopped');

/**
 * Stops a run that waits for one thing at a time. `race` settles with `STOPPED` as soon as `stop`
 * is called; only the wait in progress is remembered, so an hour-long run of short waits keeps
 * nothing of the ones that finished. Once stopped it starts no work at all: work started and left
 * unwatched could fail later with nobody to hear it.
 */
export class RunStop {
  private isStopped = false;
  private wakeWaiter: (() => void) | undefined;

  public get wasStopped(): boolean {
    return this.isStopped;
  }

  public stop(): void {
    this.isStopped = true;
    this.wakeWaiter?.();
  }

  public async race<Value>(start: () => Promise<Value>): Promise<Value | typeof STOPPED> {
    if (this.isStopped) return STOPPED;
    const work = start();
    const stopped = new Promise<typeof STOPPED>((resolve) => {
      this.wakeWaiter = (): void => {
        resolve(STOPPED);
      };
    });
    try {
      return await Promise.race([work, stopped]);
    } finally {
      this.wakeWaiter = undefined;
    }
  }
}
