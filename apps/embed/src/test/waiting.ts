import { waitFor as waitForPlayer } from '@gyroview/player/testing';

/**
 * How long a wait in the embed's tests looks before it gives up, unless it names its own time:
 * longer than for the player alone.
 */
const FRAME_WAIT_MS = 20_000;
/**
 * How long one load of the embed page in a frame may take. The page is the development page,
 * some 350 modules, each a request: under a second alone, but up to about 24 s, in Chromium and
 * WebKit alike, on a CI runner the parallel suite loads.
 */
export const FRAME_LOAD_MS = 60_000;
/**
 * What a test that loads the embed page takes besides those loads.
 */
const FRAME_TEST_REST_MS = 30_000;

/**
 * How long a test that waits on `loads` loads of the embed page may take.
 */
export function frameTestTimeout(loads: number): number {
  return loads * FRAME_LOAD_MS + FRAME_TEST_REST_MS;
}

export function waitFor(
  isSatisfied: () => boolean,
  what: string,
  timeoutMs = FRAME_WAIT_MS,
): Promise<void> {
  return waitForPlayer(isSatisfied, what, timeoutMs);
}
