import { DEFAULT_VIEW, degrees, TypedEmitter, type ViewMode, type ViewState } from '@gyroview/core';
import { describe, expect, it } from 'vitest';

import type { PlayerEvents } from './PlayerEvents';
import { PlayerView, type ViewSurface } from './PlayerView';

/**
 * The canvas the gestures happen on, in CSS pixels.
 */
const VIEWPORT = { width: 900, height: 450 };

interface Recorded {
  readonly view: PlayerView;
  readonly surface: ViewSurface;
  readonly drawn: (ViewState | ViewMode)[];
  readonly views: ViewState[];
  readonly modes: ViewMode[];
}

function recordedView(): Recorded {
  const drawn: (ViewState | ViewMode)[] = [];
  const views: ViewState[] = [];
  const modes: ViewMode[] = [];
  const events = new TypedEmitter<PlayerEvents>();
  events.on('viewchange', (state) => {
    views.push(state);
  });
  events.on('viewmodechange', (mode) => {
    modes.push(mode);
  });
  const view = new PlayerView(events, () => VIEWPORT);
  const surface: ViewSurface = {
    setFraming: (framing) => {
      drawn.push(framing.view);
    },
    setViewMode: (mode) => {
      drawn.push(mode);
    },
  };
  view.attach(surface);
  // Attaching draws the state as it is; the tests watch what follows.
  drawn.length = 0;
  return { view, surface, drawn, views, modes };
}

describe('PlayerView', () => {
  it('starts on the default view in the normal mode', () => {
    const { view } = recordedView();
    expect(view.current).toEqual(DEFAULT_VIEW);
    expect(view.viewMode).toBe('normal');
  });

  it('clamps every change, draws it and announces it', () => {
    const { view, drawn, views } = recordedView();
    view.set({ ...DEFAULT_VIEW, yaw: degrees(190), fieldOfView: degrees(500) });
    const expected = { ...DEFAULT_VIEW, yaw: -170, fieldOfView: 120 };
    expect(view.current).toEqual(expected);
    expect(drawn).toEqual([expected]);
    expect(views).toEqual([expected]);
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
    view.zoom(3);
    expect(view.current).toEqual({ ...DEFAULT_VIEW, yaw: -36 });
  });

  it('zooms toward a point of the canvas, and about the centre without one', () => {
    const { view } = recordedView();
    view.zoom(2, { x: 0.9, y: 0.5 });
    expect(view.current.yaw).toBeGreaterThan(0);
    view.reset();
    view.zoom(2);
    expect(view.current.yaw).toBe(0);
  });

  it('can be dragged in the stitched views, and not in the unzoomed raw lenses', () => {
    const { view } = recordedView();
    expect(view.canPan).toBe(true);
    view.setMode('raw-lenses');
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
    expect(drawn).toEqual(['equirectangular', DEFAULT_VIEW]);
    expect(views).toEqual([]);
    expect(view.canPan).toBe(true);
  });

  it('lets the raw lenses be dragged once zoomed in', () => {
    const { view } = recordedView();
    view.setMode('raw-lenses');
    view.zoom(1);
    expect(view.canPan).toBe(true);
    view.reset();
    expect(view.canPan).toBe(false);
  });

  it('draws its current view and mode on a renderer attached later', () => {
    const { view, surface, drawn } = recordedView();
    view.attach(undefined);
    view.setMode('equirectangular');
    view.lookAt(degrees(10), degrees(0));
    view.attach(surface);
    expect(drawn).toEqual(['equirectangular', { ...DEFAULT_VIEW, yaw: 10 }]);
  });

  it('still announces changes between loads, with no renderer to draw them', () => {
    const { view, drawn, views } = recordedView();
    view.attach(undefined);
    view.lookAt(degrees(10), degrees(0));
    expect(drawn).toEqual([]);
    expect(views).toHaveLength(1);
  });
});
