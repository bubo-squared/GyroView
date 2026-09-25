import { DEFAULT_VIEW, degrees, type ViewState } from '@gyroview/core';
import { describe, expect, it } from 'vitest';

import { PlayerView, type ViewSurface } from './PlayerView';

interface Recorded {
  readonly view: PlayerView;
  readonly drawn: ViewState[];
  readonly announced: ViewState[];
}

function recordedView(): Recorded {
  const drawn: ViewState[] = [];
  const announced: ViewState[] = [];
  const view = new PlayerView((state) => {
    announced.push(state);
  });
  const surface: ViewSurface = {
    setView: (state) => {
      drawn.push(state);
    },
  };
  view.attach(surface);
  return { view, drawn, announced };
}

describe('PlayerView', () => {
  it('starts on the default view', () => {
    expect(recordedView().view.current).toEqual(DEFAULT_VIEW);
  });

  it('clamps every change, draws it and announces it', () => {
    const { view, drawn, announced } = recordedView();
    view.set({ ...DEFAULT_VIEW, yaw: degrees(190), fieldOfView: degrees(500) });
    const expected = { ...DEFAULT_VIEW, yaw: -170, fieldOfView: 120 };
    expect(view.current).toEqual(expected);
    expect(drawn).toEqual([expected]);
    expect(announced).toEqual([expected]);
  });

  it('looks, zooms and resets through the same change', () => {
    const { view, announced } = recordedView();
    view.lookAt(degrees(30), degrees(-10));
    view.zoom(1);
    view.reset();
    expect(announced.map((state) => [state.yaw, state.pitch])).toEqual([
      [30, -10],
      [30, -10],
      [0, 0],
    ]);
    expect(announced[1]?.fieldOfView).toBeCloseTo(90 / 1.1, 9);
    expect(view.current).toEqual(DEFAULT_VIEW);
  });

  it('restores the view of a coming load quietly and still announces without a renderer', () => {
    const { view, drawn, announced } = recordedView();
    view.restore({ ...DEFAULT_VIEW, pitch: degrees(120) });
    expect(view.current.pitch).toBe(90);
    expect(announced).toEqual([]);
    view.attach(undefined);
    view.lookAt(degrees(10), degrees(0));
    expect(drawn).toEqual([]);
    expect(announced).toHaveLength(1);
  });
});
