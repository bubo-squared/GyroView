/**
 * A load that was cancelled by a newer load or by unloading; not a failure to report.
 */
export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
