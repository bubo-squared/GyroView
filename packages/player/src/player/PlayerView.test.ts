import { DEFAULT_VIEW, degrees, TypedEmitter, type ViewMode, type ViewState } from '@gyroview/core';
import { describe, expect, it } from 'vitest';

import type { PlayerEvents } from './PlayerEvents';
import { PlayerView, type ViewSurface } from './PlayerView';

const VIEWPORT_WIDTH = 900;

interface Recorded {
  readonly view: PlayerView;
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
  const view = new PlayerView(events);
  const surface: ViewSurface = {
    setView: (state) => {
      drawn.push(state);
    },
    setViewMode: (mode) => {
      drawn.push(mode);
    },
  };
  view.attach(surface);
  return { view, drawn, views, modes };
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
    view.pan({ x: 90, y: 90 }, VIEWPORT_WIDTH);
    view.zoom(3);
    expect(view.current).toEqual({ ...DEFAULT_VIEW, yaw: -36 });
  });

  it('announces nothing for a change that changes nothing', () => {
    const { view, drawn, views, modes } = recordedView();
    view.setMode('equirectangular');
    view.zoom(2);
    view.set(DEFAULT_VIEW);
    view.setMode('equirectangular');
    expect(views).toEqual([]);
    expect(modes).toEqual(['equirectangular']);
    expect(drawn).toEqual(['equirectangular']);
  });

  it('restores the view and mode of a coming load quietly and still announces without a renderer', () => {
    const { view, drawn, views, modes } = recordedView();
    view.restore({ view: { ...DEFAULT_VIEW, pitch: degrees(120) }, viewMode: 'equirectangular' });
    expect(view.current.pitch).toBe(90);
    expect(view.viewMode).toBe('equirectangular');
    expect([...views, ...modes]).toEqual([]);
    view.attach(undefined);
    view.lookAt(degrees(10), degrees(0));
    expect(drawn).toEqual([]);
    expect(views).toHaveLength(1);
  });
});
