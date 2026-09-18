/**
 * A promise settled from the outside, once: later `resolve` calls are ignored. Used where the
 * first of several callbacks decides an outcome.
 */
export class Deferred<Value> {
  public readonly promise: Promise<Value>;
  private isSettledNow = false;
  private resolvePromise: ((value: Value) => void) | undefined;

  public constructor() {
    this.promise = new Promise((resolve) => {
      this.resolvePromise = resolve;
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
}
