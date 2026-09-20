/**
 * A promise settled from outside, once: later settlements are ignored. Lets a producer report
 * an outcome to whoever is waiting without knowing them.
 */
export class Deferred<Value> {
  public readonly promise: Promise<Value>;
  private isSettledNow = false;
  private resolvePromise: ((value: Value) => void) | undefined;
  private rejectPromise: ((reason: unknown) => void) | undefined;

  public constructor() {
    this.promise = new Promise((resolve, reject) => {
      this.resolvePromise = resolve;
      this.rejectPromise = reject;
    });
  }

  public get isSettled(): boolean {
    return this.isSettledNow;
  }

  public resolve(value: Value): void {
    if (this.isSettledNow) return;
    this.isSettledNow = true;
    this.resolvePromise?.(value);
  }

  public reject(reason: unknown): void {
    if (this.isSettledNow) return;
    this.isSettledNow = true;
    this.rejectPromise?.(reason);
  }
}
