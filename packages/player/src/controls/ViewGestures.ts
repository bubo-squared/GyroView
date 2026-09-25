import { distanceBetween, zoomStepsForPinch, type Point } from './pinch';
import type { Player } from '../player/Player';

/**
 * A wheel notch on most mice reports about 100 pixels; one notch is one zoom step.
 */
const WHEEL_PIXELS_PER_STEP = 100;
/**
 * Movement below this is a tap, not a drag.
 */
const TAP_TOLERANCE_PIXELS = 4;

/**
 * Turns pointer drags, two-finger pinches and wheel turns on the surface into view changes,
 * and reports a tap (a press without a drag) for the host to treat as a play toggle.
 */
export class ViewGestures {
  private readonly pointers = new Map<number, Point>();
  private dragDistance = 0;

  public constructor(
    private readonly surface: HTMLElement,
    private readonly player: Player,
    private readonly onTap: () => void,
  ) {
    surface.addEventListener('pointerdown', this.onPointerDown);
    surface.addEventListener('pointermove', this.onPointerMove);
    surface.addEventListener('pointerup', this.onPointerUp);
    surface.addEventListener('pointercancel', this.onPointerUp);
    surface.addEventListener('wheel', this.onWheel, { passive: false });
  }

  public dispose(): void {
    this.surface.removeEventListener('pointerdown', this.onPointerDown);
    this.surface.removeEventListener('pointermove', this.onPointerMove);
    this.surface.removeEventListener('pointerup', this.onPointerUp);
    this.surface.removeEventListener('pointercancel', this.onPointerUp);
    this.surface.removeEventListener('wheel', this.onWheel);
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (this.pointers.size === 0) this.dragDistance = 0;
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    this.surface.setPointerCapture(event.pointerId);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const previous = this.pointers.get(event.pointerId);
    if (!previous) return;
    const current = { x: event.clientX, y: event.clientY };
    if (this.pointers.size === 1) this.pan(previous, current);
    else this.pinch(event.pointerId, current);
    this.pointers.set(event.pointerId, current);
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    const wasTracked = this.pointers.delete(event.pointerId);
    if (!wasTracked || this.pointers.size > 0) return;
    if (this.dragDistance < TAP_TOLERANCE_PIXELS) this.onTap();
  };

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    this.player.zoom(-event.deltaY / WHEEL_PIXELS_PER_STEP);
  };

  private pan(previous: Point, current: Point): void {
    const delta = { x: current.x - previous.x, y: current.y - previous.y };
    this.dragDistance += Math.hypot(delta.x, delta.y);
    this.player.pan(delta, this.surface.clientWidth);
  }

  private pinch(pointerId: number, current: Point): void {
    const other = [...this.pointers].find(([id]) => id !== pointerId)?.[1];
    const previous = this.pointers.get(pointerId);
    if (!other || !previous) return;
    this.dragDistance = Infinity;
    const steps = zoomStepsForPinch(
      distanceBetween(previous, other),
      distanceBetween(current, other),
    );
    this.player.zoom(steps);
  }
}
