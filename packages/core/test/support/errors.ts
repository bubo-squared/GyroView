/**
 * Runs `action` and returns what it threw, failing loudly when nothing was thrown.
 */
export function captureError(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error('expected the action to throw');
}
