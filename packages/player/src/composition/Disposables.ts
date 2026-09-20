/**
 * Collects the resources one operation opens so a failure part way can release them in reverse
 * order, and so success can hand them over as a single disposer.
 */
export class Disposables {
  private readonly actions: (() => void)[] = [];
  private isDisposed = false;

  public add(dispose: () => void): void {
    if (this.isDisposed) {
      dispose();
      return;
    }
    this.actions.push(dispose);
  }

  public disposeAll(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    for (const dispose of this.actions.splice(0).toReversed()) dispose();
  }

  /**
   * The collected resources as one idempotent disposer, for the object that will own them.
   */
  public toDisposer(): () => void {
    return (): void => {
      this.disposeAll();
    };
  }
}
