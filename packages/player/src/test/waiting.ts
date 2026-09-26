/**
 * How long a browser test waits for the player before it gives up, and how often it looks.
 */
const WAIT_MS = 15_000;
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

/**
 * The detail of the next `name` event on the target.
 */
export function nextEvent<Detail>(target: EventTarget, name: string): Promise<Detail> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`no ${name} event within ${WAIT_MS} ms`));
    }, WAIT_MS);
    target.addEventListener(
      name,
      (event) => {
        clearTimeout(timer);
        resolve((event as CustomEvent<Detail>).detail);
      },
      { once: true },
    );
  });
}

/**
 * Lets the promise reactions and timers queued so far run.
 */
export async function settle(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
