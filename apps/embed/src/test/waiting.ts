import { waitFor as waitForPlayer } from '@gyroview/player/testing';

/**
 * How long a browser test waits for the frame before it gives up: longer than for the player
 * alone, since the frame loads a page of its own first.
 */
const FRAME_WAIT_MS = 20_000;
/**
 * How long a test may wait for the embed page to load in its frame, and how long such a test may
 * take. The page is the development page, some 350 modules, each a request: under a second
 * alone, more than 20 s in WebKit on a CI runner the parallel suite loads.
 */
export const FRAME_LOAD_MS = 60_000;
export const FRAME_TEST_TIMEOUT_MS = 90_000;

export function waitFor(
  isSatisfied: () => boolean,
  what: string,
  timeoutMs = FRAME_WAIT_MS,
): Promise<void> {
  return waitForPlayer(isSatisfied, what, timeoutMs);
}
