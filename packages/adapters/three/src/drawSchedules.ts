/**
 * Strategy: when a renderer draws the picture again after one of its settings changed (the view,
 * the view mode, the quality, the lens gains).
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

/**
 * Runs a callback at the next animation frame; `requestAnimationFrame` in the browser.
 */
export interface AnimationFrames {
  request(callback: () => void): number;
  cancel(handle: number): void;
}

const BROWSER_ANIMATION_FRAMES: AnimationFrames = {
  request: (callback): number => requestAnimationFrame(callback),
  cancel: (handle): void => {
    cancelAnimationFrame(handle);
  },
};

/**
 * Draws once at the next animation frame for every change before it: the screen shows one
 * picture a frame, and WebKit hands the page every pointer event of a drag, thousands a second
 * from a fast mouse, which drawn one by one leave no time for the frames of the recording.
 */
export class AnimationFrameDraws implements DrawSchedule {
  private pending: { readonly handle: number; draw: () => void } | undefined;

  public constructor(private readonly frames: AnimationFrames = BROWSER_ANIMATION_FRAMES) {}

  public request(draw: () => void): void {
    if (this.pending) {
      this.pending.draw = draw;
      return;
    }
    const handle = this.frames.request(() => {
      const due = this.pending;
      this.pending = undefined;
      due?.draw();
    });
    this.pending = { handle, draw };
  }

  public cancel(): void {
    if (!this.pending) return;
    this.frames.cancel(this.pending.handle);
    this.pending = undefined;
  }
}
