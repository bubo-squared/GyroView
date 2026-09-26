/**
 * How long a browser test waits for the player or the frame before it gives up, and how often
 * it looks.
 */
const WAIT_MS = 20_000;
const POLL_MS = 20;

/**
 * Resolves once `isSatisfied` holds, looking every few milliseconds; fails naming `what`.
 */
export async function waitFor(isSatisfied: () => boolean, what: string): Promise<void> {
  const deadline = performance.now() + WAIT_MS;
  while (!isSatisfied()) {
    if (performance.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => {
      setTimeout(resolve, POLL_MS);
    });
  }
}
