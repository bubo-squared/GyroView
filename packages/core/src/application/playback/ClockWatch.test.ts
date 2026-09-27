import { describe, expect, it } from 'vitest';

import { ClockWatch } from './ClockWatch';
import { seconds } from '../../shared/units/time';

describe('ClockWatch', () => {
  it('takes a move back for a move from outside while playing, and any move while still', () => {
    const watch = new ClockWatch();
    watch.placedAt(seconds(1));
    expect(watch.wasMovedFromOutside(seconds(3), true)).toBe(false);
    expect(watch.wasMovedFromOutside(seconds(2), true)).toBe(true);
    expect(watch.wasMovedFromOutside(seconds(2.1), false)).toBe(false);
    expect(watch.wasMovedFromOutside(seconds(1), false)).toBe(true);
  });

  it('takes a stop ahead of the last tick for playback, and one behind it for a move', () => {
    const ranOn = new ClockWatch();
    ranOn.placedAt(seconds(1));
    ranOn.stoppedAt(seconds(2));
    expect(ranOn.wasMovedFromOutside(seconds(2), false)).toBe(false);
    const movedBack = new ClockWatch();
    movedBack.placedAt(seconds(2));
    movedBack.stoppedAt(seconds(1));
    expect(movedBack.wasMovedFromOutside(seconds(1), false)).toBe(true);
  });

  it('sees no move before it knows where the clock is', () => {
    expect(new ClockWatch().wasMovedFromOutside(seconds(5), false)).toBe(false);
  });

  it('counts ticks as missed only between two playing ticks a while apart', () => {
    const watch = new ClockWatch();
    watch.playingFrom(seconds(0));
    expect(watch.wereTicksMissed(seconds(0.5), true)).toBe(false);
    expect(watch.wereTicksMissed(seconds(2), true)).toBe(true);
    expect(watch.wereTicksMissed(seconds(5), false)).toBe(false);
    expect(watch.wereTicksMissed(seconds(9), true)).toBe(false);
  });
});
