/**
 * A one-shot signal: a promise that resolves when `trigger` is called, without any timer or
 * platform API. Every race against it stays attached, result and all, until it fires: a loop
 * that waits many times stops through a {@link RunStop} instead.
 */
export class Signal {
  public readonly promise: Promise<void>;
  private resolvePromise: (() => void) | undefined;

  public constructor() {
    this.promise = new Promise((resolve) => {
      this.resolvePromise = resolve;
    });
  }

  public trigger(): void {
    this.resolvePromise?.();
  }
}
