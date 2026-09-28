import { describe, expect, it } from 'vitest';

import { ClockWatch } from './ClockWatch';
import { seconds } from '../../shared/units/time';

describe('ClockWatch', () => {
  it('takes a move back for a move from outside while playing, and any move while still', () => {
    const watch = new ClockWatch();
    watch.placedAt(seconds(1));
    expect(watch.wasMovedFromOutside({ now: seconds(3), state: 'playing' })).toBe(false);
    expect(watch.wasMovedFromOutside({ now: seconds(2), state: 'playing' })).toBe(true);
    expect(watch.wasMovedFromOutside({ now: seconds(2.1), state: 'paused' })).toBe(false);
    expect(watch.wasMovedFromOutside({ now: seconds(1), state: 'paused' })).toBe(true);
  });

  it('takes a stop ahead of the last tick for playback, and one behind it for a move', () => {
    const ranOn = new ClockWatch();
    ranOn.placedAt(seconds(1));
    ranOn.stoppedAt(seconds(2));
    expect(ranOn.wasMovedFromOutside({ now: seconds(2), state: 'paused' })).toBe(false);
    const movedBack = new ClockWatch();
    movedBack.placedAt(seconds(2));
    movedBack.stoppedAt(seconds(1));
    expect(movedBack.wasMovedFromOutside({ now: seconds(1), state: 'paused' })).toBe(true);
  });

  it('sees no move before it knows where the clock is', () => {
    expect(new ClockWatch().wasMovedFromOutside({ now: seconds(5), state: 'paused' })).toBe(false);
  });

  it('counts ticks as missed only between two playing ticks a while apart', () => {
    const watch = new ClockWatch();
    watch.playingFrom(seconds(0));
    expect(watch.wereTicksMissed({ now: seconds(0.5), state: 'playing' })).toBe(false);
    expect(watch.wereTicksMissed({ now: seconds(2), state: 'playing' })).toBe(true);
    expect(watch.wereTicksMissed({ now: seconds(5), state: 'paused' })).toBe(false);
    expect(watch.wereTicksMissed({ now: seconds(9), state: 'playing' })).toBe(false);
  });
});
