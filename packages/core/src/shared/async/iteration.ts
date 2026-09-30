/**
 * What an iteration answers once it has ended.
 */
export const ITERATION_END: IteratorReturnResult<undefined> = { done: true, value: undefined };

/**
 * Whether an iteration has ended, asked by a call after every wait: TypeScript takes a field read
 * before an `await` for the same value after it, though a `return()` may have ended the iteration
 * meanwhile.
 */
export class Ending {
  private isEnded = false;

  public end(): void {
    this.isEnded = true;
  }

  public hasEnded(): boolean {
    return this.isEnded;
  }
}
