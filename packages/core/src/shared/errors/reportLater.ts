/**
 * A failure nobody is waiting for surfaces as an unhandled rejection, where the platform reports
 * it, and leaves whoever met it to carry on.
 */
export function reportLater(error: unknown): void {
  const reason =
    error instanceof Error ? error : new Error('a failure went unheard', { cause: error });
  void Promise.reject(reason);
}
