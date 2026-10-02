/**
 * Schedules work for the next animation frame; `requestAnimationFrame` in the browser. A request
 * never runs its callback before it returns.
 */
export interface FrameScheduler {
  request(callback: () => void): number;
  cancel(handle: number): void;
}

export const ANIMATION_FRAMES: FrameScheduler = {
  request: (callback): number => requestAnimationFrame(callback),
  cancel: (handle): void => {
    cancelAnimationFrame(handle);
  },
};
