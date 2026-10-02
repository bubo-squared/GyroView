/**
 * Strategy: when a renderer draws the picture again after one of its settings changed (the view,
 * the view mode, the quality, the lens gains). A schedule serves one renderer: the draw it holds
 * is that renderer's.
 */
export interface DrawSchedule {
  /**
   * Asks for `draw` to run, at once or later; a later run serves every request made before it.
   */
  request(draw: () => void): void;
  /**
   * The picture asked for was drawn by other means, a presented frame: nothing pending runs.
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
