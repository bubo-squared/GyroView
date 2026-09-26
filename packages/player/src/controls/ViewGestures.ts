import { zoomStepsForPinch, type ScreenPoint } from '@gyroview/core';

import type { Player } from '../player/Player';

/**
 * A pointer's position on the page, in CSS pixels.
 */
interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * What the gestures move, and whether a drag would move it.
 */
type GestureTarget = Pick<Player, 'pan' | 'zoom' | 'canPan'>;

/**
 * A wheel notch on most mice reports about 100 pixels; one notch is one zoom step.
 */
const WHEEL_PIXELS_PER_STEP = 100;
/**
 * Movement below this is a tap, not a drag.
 */
const TAP_TOLERANCE_PIXELS = 4;

/**
 * Turns pointer drags, two-finger pinches and wheel turns on the surface into view changes, the
 * zooms toward the pointer or the fingers, and reports a tap (a press without a drag) for the
 * host to treat as a play toggle. Whether a drag would move the picture is checked whenever the
 * pointer moves over the surface, so the cursor shows a hand only then.
 */
export class ViewGestures {
  private readonly pointers = new Map<number, Point>();
  private dragDistance = 0;

  public constructor(
    private readonly surface: HTMLElement,
    private readonly player: GestureTarget,
    private readonly onTap: () => void,
  ) {
    surface.addEventListener('pointerenter', this.showDraggable);
    surface.addEventListener('pointerdown', this.onPointerDown);
    surface.addEventListener('pointermove', this.onPointerMove);
    surface.addEventListener('pointerup', this.onPointerUp);
    surface.addEventListener('pointercancel', this.onPointerUp);
    surface.addEventListener('wheel', this.onWheel, { passive: false });
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (this.pointers.size === 0) this.dragDistance = 0;
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    this.surface.setPointerCapture(event.pointerId);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    this.showDraggable();
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
    const pointer = { x: event.clientX, y: event.clientY };
    this.player.zoom(-event.deltaY / WHEEL_PIXELS_PER_STEP, this.focusAt(pointer));
    this.showDraggable();
  };

  /**
   * `data-draggable` on the surface while a drag would move the picture: the stylesheet shows the
   * grab hand for it.
   */
  private readonly showDraggable = (): void => {
    if (this.player.canPan) this.surface.dataset['draggable'] = '';
    else delete this.surface.dataset['draggable'];
  };

  private pan(previous: Point, current: Point): void {
    const delta = { x: current.x - previous.x, y: current.y - previous.y };
    this.dragDistance += Math.hypot(delta.x, delta.y);
    this.player.pan(delta);
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
    const between = { x: (current.x + other.x) / 2, y: (current.y + other.y) / 2 };
    this.player.zoom(steps, this.focusAt(between));
  }

  /**
   * A point of the page as fractions of the surface, from its top-left corner.
   */
  private focusAt(point: Point): ScreenPoint {
    const bounds = this.surface.getBoundingClientRect();
    return {
      x: (point.x - bounds.left) / Math.max(bounds.width, 1),
      y: (point.y - bounds.top) / Math.max(bounds.height, 1),
    };
  }
}

function distanceBetween(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
