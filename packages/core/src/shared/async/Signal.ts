/**
 * A one-shot signal: a promise that resolves when `trigger` is called, without any timer or
 * platform API. Every race against it stays attached, result and all, until it fires: a loop
 * that waits many times stops through a {@link RunStop} instead.
 */
export class Signal {
  public readonly promise: Promise<void>;
  private isTriggered = false;
  private resolvePromise: (() => void) | undefined;

  public constructor() {
    this.promise = new Promise((resolve) => {
      this.resolvePromise = resolve;
    });
  }

  public get wasTriggered(): boolean {
    return this.isTriggered;
  }

  public trigger(): void {
    this.isTriggered = true;
    this.resolvePromise?.();
  }
}
