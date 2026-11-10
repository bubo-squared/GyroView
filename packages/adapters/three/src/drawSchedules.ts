/**
 * Strategy: when a renderer draws the picture again after one of its settings changed (the view,
 * the view mode, the quality, the lens gains). A schedule serves one renderer: the draw it holds
 * is that renderer's.
 */
export interface DrawSchedule {
  /**
   * Asks for `draw` to run, at once or later, or leaves the change to the next presented pair; a
   * later run serves every request made before it.
   */
  request(draw: () => void): void;
  /**
   * The picture asked for was drawn by other means, a presented pair: nothing pending runs.
   */
  cancel(): void;
}

/**
 * Draws every change at once, for whoever reads the canvas right after a change, as the tests
 * and the measurements do.
 */
export const DRAW_AT_ONCE: DrawSchedule = {
  request: (draw): void => {
    draw();
  },
  cancel: (): void => {
    // Nothing waits.
  },
};

/**
 * Draws nothing on its own: every change, a restored context included, waits for the next
 * presented pair, for whoever reads the canvas only right after a pair, as a rendition does.
 */
export const DRAW_WITH_NEXT_PAIR: DrawSchedule = {
  request: (): void => {
    // The next presented pair draws the change.
  },
  cancel: (): void => {
    // Nothing waits.
  },
};
