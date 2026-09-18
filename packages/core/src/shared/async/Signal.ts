/**
 * A one-shot signal: a promise that resolves when `trigger` is called. Lets a long-running loop
 * race a wait against a request to stop without any timer or platform API.
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
