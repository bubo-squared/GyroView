import type { DrawSchedule } from '@gyroview/adapter-three';

import { ANIMATION_FRAMES, type FrameScheduler } from './animationFrames';

/**
 * Draws a renderer's changed settings once at the next animation frame, however many changes
 * come before it (ADR 0035): the screen shows one picture a frame, and WebKit hands the page
 * every pointer move of a drag, thousands a second from a fast mouse, which drawn one by one
 * leave no time for the frames of the recording. One schedule serves one renderer.
 */
export class AnimationFrameDraws implements DrawSchedule {
  private pendingDraw: (() => void) | undefined;
  private handle: number | undefined;

  public constructor(private readonly frames: FrameScheduler = ANIMATION_FRAMES) {}

  /**
   * The latest draw asked for is the one drawn.
   */
  public request(draw: () => void): void {
    const isFrameRequested = this.pendingDraw !== undefined;
    this.pendingDraw = draw;
    if (!isFrameRequested) this.handle = this.frames.request(this.drawPending);
  }

  public cancel(): void {
    this.pendingDraw = undefined;
    if (this.handle === undefined) return;
    this.frames.cancel(this.handle);
    this.handle = undefined;
  }

  private readonly drawPending = (): void => {
    const draw = this.pendingDraw;
    this.pendingDraw = undefined;
    this.handle = undefined;
    draw?.();
  };
}
