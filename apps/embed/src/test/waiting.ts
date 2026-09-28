import { waitFor as waitForPlayer } from '@gyroview/player/testing';

/**
 * How long a browser test waits for the frame before it gives up: longer than for the player
 * alone, since the frame loads a page of its own first.
 */
const FRAME_WAIT_MS = 20_000;

export function waitFor(isSatisfied: () => boolean, what: string): Promise<void> {
  return waitForPlayer(isSatisfied, what, FRAME_WAIT_MS);
}
