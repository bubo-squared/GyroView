import { discardBody } from './httpRequest';
import { isPassing, isPassingStatus, isUnreachable } from './passingFailures';

/**
 * The waits before asking again for a request that failed on the way: a blink of a mobile network
 * or a restarting server passes within them, a network that is gone does not.
 */
const FIRST_RETRY_DELAY_MS = 250;
const SECOND_RETRY_DELAY_MS = 1000;
export const DEFAULT_RETRY_DELAYS_MS: readonly number[] = [
  FIRST_RETRY_DELAY_MS,
  SECOND_RETRY_DELAY_MS,
];

export interface RetryOptions {
  /**
   * The waits before each new attempt at a request that failed on the way; as many retries as
   * waits. Default 250 ms, then 1 s.
   */
  readonly retryDelaysMs?: readonly number[];
}

/**
 * Runs `attempt`, and after each of `delaysMs` again, while it fails on the way (`isPassing`):
 * the last failure stands once the waits ran out. Any other failure, an abort among them, ends
 * it at once, and an abort of `signal` ends a wait.
 */
export async function askingAgain<T>(
  attempt: () => Promise<T>,
  delaysMs: readonly number[],
  signal: AbortSignal | null | undefined,
): Promise<T> {
  for (const delayMs of delaysMs) {
    try {
      return await attempt();
    } catch (error) {
      if (!isPassing(error)) throw error;
    }
    await wait(delayMs, signal);
  }
  return attempt();
}

/**
 * The answer to `ask`, asked for again after each of `delaysMs` while it fails on the way: its
 * server failed or asked the player to slow down, or `ask` found it unreachable. Once the waits
 * ran out the last answer, or failure, stands as any other would, so a caller's own retries do not
 * ask a failing server again.
 */
export async function answerAskedAgain(
  ask: () => Promise<Response>,
  delaysMs: readonly number[],
  signal: AbortSignal | null | undefined,
): Promise<Response> {
  for (const delayMs of delaysMs) {
    const response = await answerUnlessFailedOnTheWay(ask);
    if (response !== undefined) return response;
    await wait(delayMs, signal);
  }
  return ask();
}

async function answerUnlessFailedOnTheWay(
  ask: () => Promise<Response>,
): Promise<Response | undefined> {
  let response: Response;
  try {
    response = await ask();
  } catch (error) {
    if (isUnreachable(error)) return undefined;
    throw error;
  }
  if (!isPassingStatus(response.status)) return response;
  discardBody(response);
  return undefined;
}

/**
 * A pause before asking again, which an abort of the requests ends at once.
 */
function wait(ms: number, signal: AbortSignal | null | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const settled = new AbortController();
    const timer = setTimeout(() => {
      settled.abort();
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(abortErrorOf(signal));
    };
    signal?.addEventListener('abort', onAbort, { once: true, signal: settled.signal });
  });
}

function abortErrorOf(signal: AbortSignal | null | undefined): Error {
  const reason: unknown = signal?.reason;
  return reason instanceof Error ? reason : new DOMException('the read was aborted', 'AbortError');
}
