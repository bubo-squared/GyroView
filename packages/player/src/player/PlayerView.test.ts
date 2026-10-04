import {
  DEFAULT_FRAMING,
  DEFAULT_VIEW,
  degrees,
  milliseconds,
  TypedEmitter,
  type DeviceReading,
  type Framing,
  type ViewMode,
  type ViewportSize,
  type ViewState,
} from '@gyroview/core';
import { describe, expect, it } from 'vitest';

import type { PlayerEvents } from './PlayerEvents';
import type { ViewAngles } from './PlayerOptions';
import { PlayerView, type ViewSurface } from './PlayerView';

interface Recorded {
  readonly view: PlayerView;
  readonly surface: ViewSurface;
  /**
   * What the renderer was asked to draw, framings and modes in order.
   */
  readonly drawn: (Framing | ViewMode)[];
  readonly views: ViewAngles[];
  readonly modes: ViewMode[];
  /**
   * The canvas the gestures happen on, in CSS pixels; a test may resize it.
   */
  readonly canvas: { size: ViewportSize };
}

function recordedView(lensCount = 2): Recorded {
  const drawn: (Framing | ViewMode)[] = [];
  const views: ViewAngles[] = [];
  const modes: ViewMode[] = [];
  const events = new TypedEmitter<PlayerEvents>();
  events.on('viewchange', (state) => {
    views.push(state);
  });
  events.on('viewmodechange', (mode) => {
    modes.push(mode);
  });
  const canvas = { size: { width: 900, height: 450 } };
  const view = new PlayerView(events, () => canvas.size);
  const surface: ViewSurface = {
    lensCount,
    setFraming: (framing) => {
      drawn.push(framing);
    },
    setViewMode: (mode) => {
      drawn.push(mode);
    },
  };
  view.attach(surface);
  // The gestures under test turn the normal view. Attaching and choosing it draw the state as
  // it is; the tests watch what follows.
  view.setMode('normal');
  drawn.length = 0;
  modes.length = 0;
  return { view, surface, drawn, views, modes, canvas };
}

/**
 * The device looking at yaw, pitch and roll, in degrees, read at `at` milliseconds.
 */
function readingAt(
  at: number,
  [yaw, pitch, roll]: readonly [number, number, number],
): DeviceReading {
  return {
    look: { yaw: degrees(yaw), pitch: degrees(pitch), roll: degrees(roll) },
    at: milliseconds(at),
  };
}

function framingOf(view: ViewState): Framing {
  return { ...DEFAULT_FRAMING, view };
}

/**
 * Where across the lens tiles the canvas centre is, once zoomed to 1.1^7 and dragged far left.
 */
function lensesAcrossAfterMovingFar(lensCount: number): number {
  const { view, drawn } = recordedView(lensCount);
  view.setMode('raw-lenses');
  view.zoom(7);
  view.pan({ x: -900, y: 0 });
  const last = drawn.at(-1);
  return typeof last === 'object' ? last.lenses.centre.x : NaN;
}

describe('PlayerView', () => {
  it('starts on the default view, showing the raw lenses', () => {
    const view = new PlayerView(new TypedEmitter<PlayerEvents>(), () => ({
      width: 900,
      height: 450,
    }));
    expect(view.current).toEqual(DEFAULT_VIEW);
    expect(view.viewMode).toBe('raw-lenses');
  });

  it('clamps every change, draws it and announces it', () => {
    const { view, drawn, views } = recordedView();
    view.set({ ...DEFAULT_VIEW, yaw: degrees(190), fieldOfView: degrees(500) });
    const expected = { ...DEFAULT_VIEW, yaw: -170, fieldOfView: 120 };
    expect(view.current).toEqual(expected);
    expect(drawn).toEqual([{ ...DEFAULT_FRAMING, view: expected }]);
    expect(views).toEqual([{ yaw: -170, pitch: 0, fieldOfView: 120 }]);
    expect(Object.keys(views[0] ?? {})).toEqual(['yaw', 'pitch', 'fieldOfView']);
  });

  it('looks, turns, zooms and resets through the same change', () => {
    const { view, views } = recordedView();
    view.lookAt(degrees(30), degrees(-10));
    view.turn(degrees(5), degrees(5));
    view.zoom(1);
    view.reset();
    expect(views.map((state) => [state.yaw, state.pitch])).toEqual([
      [30, -10],
      [35, -5],
      [35, -5],
      [0, 0],
    ]);
    expect(views[2]?.fieldOfView).toBeCloseTo(90 / 1.1, 9);
    expect(view.current).toEqual(DEFAULT_VIEW);
  });

  it('switches the mode, draws and announces it, and lets the mode rule the gestures', () => {
    const { view, drawn, modes } = recordedView();
    view.setMode('equirectangular');
    expect(view.viewMode).toBe('equirectangular');
    expect(drawn).toEqual(['equirectangular']);
    expect(modes).toEqual(['equirectangular']);
    view.pan({ x: 90, y: 90 });
    expect(view.current).toEqual({ ...DEFAULT_VIEW, yaw: -36 });
  });

  it('measures every gesture on the canvas as it is at the time', () => {
    const { view, canvas } = recordedView();
    view.pan({ x: 90, y: 0 });
    expect(view.current.yaw).toBeCloseTo(-9, 9);
    canvas.size = { width: 450, height: 450 };
    view.pan({ x: 90, y: 0 });
    expect(view.current.yaw).toBeCloseTo(-27, 9);
  });

  it('zooms toward a point of the canvas, and about the centre without one', () => {
    const { view } = recordedView();
    view.zoom(2, { x: 0.9, y: 0.5 });
    expect(view.current.yaw).toBeGreaterThan(0);
    view.reset();
    view.zoom(2);
    expect(view.current.yaw).toBe(0);
  });

  it('can be dragged in the stitched views, and in the raw lenses once zoomed in', () => {
    const { view } = recordedView();
    expect(view.canPan).toBe(true);
    view.setMode('raw-lenses');
    expect(view.canPan).toBe(false);
    view.zoom(1);
    expect(view.canPan).toBe(true);
    view.reset();
    expect(view.canPan).toBe(false);
  });

  it('resets the current mode only', () => {
    const { view } = recordedView();
    view.lookAt(degrees(30), degrees(-10));
    view.setMode('equirectangular');
    view.reset();
    expect(view.current).toEqual({ ...DEFAULT_VIEW, pitch: -10 });
  });

  it('announces nothing for a change that changes nothing', () => {
    const { view, drawn, views, modes } = recordedView();
    view.setMode('raw-lenses');
    view.pan({ x: 50, y: 0 });
    view.set(DEFAULT_VIEW);
    view.setMode('raw-lenses');
    expect(views).toEqual([]);
    expect(modes).toEqual(['raw-lenses']);
    expect(drawn).toEqual(['raw-lenses']);
  });

  it('draws a zoomed panorama without announcing the normal view, which it leaves alone', () => {
    const { view, drawn, views } = recordedView();
    view.setMode('equirectangular');
    view.zoom(2);
    expect(drawn).toEqual([
      'equirectangular',
      { ...DEFAULT_FRAMING, panorama: { scale: 1.1 ** 2, centre: { x: 0.5, y: 0.5 } } },
    ]);
    expect(views).toEqual([]);
  });

  it('lays out the raw lenses for as many lenses as its renderer draws', () => {
    // One square tile on a 2:1 canvas is half its width: nearly twice as large it is still no
    // wider than the canvas and cannot move sideways; two tiles side by side can.
    expect(lensesAcrossAfterMovingFar(1)).toBe(0.5);
    expect(lensesAcrossAfterMovingFar(2)).toBeGreaterThan(0.5);
  });

  it('draws its current framing and mode on a renderer attached later', () => {
    const { view, surface, drawn } = recordedView();
    view.attach(undefined);
    view.setMode('equirectangular');
    view.lookAt(degrees(10), degrees(0));
    view.attach(surface);
    expect(drawn).toEqual(['equirectangular', framingOf({ ...DEFAULT_VIEW, yaw: degrees(10) })]);
  });

  it('still announces changes between loads, with no renderer to draw them', () => {
    const { view, drawn, views } = recordedView();
    view.attach(undefined);
    view.lookAt(degrees(10), degrees(0));
    expect(drawn).toEqual([]);
    expect(views).toHaveLength(1);
  });

  it('lets the device turn the normal view alone', () => {
    const { view } = recordedView();
    expect(view.followsDevice).toBe(true);
    view.setMode('equirectangular');
    expect(view.followsDevice).toBe(false);
    view.setMode('raw-lenses');
    expect(view.followsDevice).toBe(false);
  });

  it('follows the device from its first reading, keeping the yaw, the roll drawn but not announced', () => {
    const { view, drawn, views } = recordedView();
    view.lookAt(degrees(30), degrees(0));
    view.followDevice(readingAt(0, [-100, 20, 10]));
    view.followDevice(readingAt(16, [-90, 20, 12]));
    expect(view.current).toEqual({ ...DEFAULT_VIEW, yaw: 40, pitch: 20, roll: 12 });
    expect(drawn.at(-1)).toEqual(framingOf(view.current));
    view.followDevice(readingAt(32, [-90, 20, 14]));
    expect(views.map((angles) => angles.yaw)).toEqual([30, 30, 40]);
  });

  it('turns the heading alone while the device holds the view, a page setting yaw and zoom only', () => {
    const { view } = recordedView();
    view.followDevice(readingAt(0, [0, 20, 10]));
    view.pan({ x: 90, y: 300 });
    expect(view.current).toMatchObject({ yaw: -9, pitch: 20, roll: 10 });
    view.set({ ...DEFAULT_VIEW, yaw: degrees(50), pitch: degrees(-40), fieldOfView: degrees(60) });
    expect(view.current).toEqual({ yaw: 50, pitch: 20, roll: 10, fieldOfView: 60 });
    view.lookAt(degrees(5), degrees(-60));
    expect(view.current).toMatchObject({ yaw: 5, pitch: 20, roll: 10 });
    view.zoom(1, { x: 0.9, y: 0.1 });
    expect(view.current).toMatchObject({ yaw: 5, pitch: 20, roll: 10 });
  });

  it('lets go level, looking where it looked, and gives the gestures back to the pointer', () => {
    const { view } = recordedView();
    view.followDevice(readingAt(0, [0, 20, 10]));
    view.letGo();
    expect(view.current).toEqual({ ...DEFAULT_VIEW, pitch: 20 });
    view.pan({ x: 0, y: 90 });
    expect(view.current.pitch).toBeCloseTo(29, 9);
    view.followDevice(readingAt(16, [80, 20, 0]));
    expect(view.current.yaw).toBe(0);
  });
});
