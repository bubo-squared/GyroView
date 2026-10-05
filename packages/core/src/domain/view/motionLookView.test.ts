import { describe, expect, it } from 'vitest';

import { followReading, MOTION_LOOK_VIEW, withoutRoll, type DeviceReading } from './motionLookView';
import { rectilinearPicture } from './normalView';
import { DEFAULT_VIEW, type ViewState } from './ViewState';
import { degrees } from '../../shared/units/angle';
import { milliseconds } from '../../shared/units/time';
import { EVERYTHING_MOVED, SQUARE, TILTED, turnOf } from '../../../test/support/viewFixtures';

/**
 * Readings come about every 16 milliseconds while the sensor runs.
 */
const READING_INTERVAL_MS = 16;

/**
 * A reading at `at` milliseconds of the device looking at yaw, pitch and roll, in degrees.
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

/**
 * A view the device holds: turned, tilted and rolled.
 */
const HELD: ViewState = {
  yaw: degrees(40),
  pitch: degrees(10),
  roll: degrees(5),
  fieldOfView: degrees(70),
};

function followed(
  view: ViewState,
  previous: DeviceReading | undefined,
  reading: DeviceReading,
): ViewState {
  return followReading(view, previous, reading).view;
}

describe('a view held by the device', () => {
  it('keeps its yaw at the first reading, and takes the pitch and roll the device gives', () => {
    expect(followed(TILTED, undefined, readingAt(0, [-120, 15, 3]))).toEqual({
      ...TILTED,
      pitch: 15,
      roll: 3,
    });
  });

  it('turns by as much as the device turned since the last reading, across the half turn', () => {
    const previous = readingAt(0, [170, 0, 0]);
    const turned = followed(HELD, previous, readingAt(READING_INTERVAL_MS, [-170, 12, -4]));
    expect(turned).toEqual({ ...HELD, yaw: 60, pitch: 12, roll: -4 });
  });

  it('keeps its yaw after a gap in the readings, where the device may count from a new zero', () => {
    const previous = readingAt(2000, [0, 0, 0]);
    expect(followed(HELD, previous, readingAt(2501, [90, 10, 5]))).toEqual(HELD);
    expect(followed(HELD, previous, readingAt(2500, [90, 10, 5])).yaw).toBe(130);
  });

  it('leaves the view as it is for a turn too small to see, so a phone at rest draws nothing', () => {
    const previous = readingAt(0, [0, 10, 5]);
    const unseen = followReading(HELD, previous, readingAt(16, [0.004, 10.004, 5]));
    expect(unseen.view).toBe(HELD);
    expect(unseen.reading).toEqual({ look: previous.look, at: 16 });
  });

  it('lands a slow drift in full once it shows, counted from the look last shown', () => {
    let hold = { view: HELD, reading: readingAt(0, [0, 10, 5]) };
    for (const [at, yaw] of [
      [16, 0.005],
      [32, 0.009],
      [48, 0.02],
    ] as const) {
      hold = followReading(hold.view, hold.reading, readingAt(at, [yaw, 10, 5]));
    }
    expect(hold.view.yaw).toBeCloseTo(40.02, 9);
  });

  it('rests longer than the gap without losing the turn that follows', () => {
    let hold = { view: HELD, reading: readingAt(0, [0, 10, 5]) };
    for (let at = 16; at <= 1600; at += 16) {
      hold = followReading(hold.view, hold.reading, readingAt(at, [0.001, 10, 5]));
    }
    expect(hold.view).toBe(HELD);
    hold = followReading(hold.view, hold.reading, readingAt(1616, [3, 10, 5]));
    expect(hold.view.yaw).toBeCloseTo(43, 9);
  });

  it('follows the first reading even when it changes nothing visible', () => {
    const resting = { ...HELD, roll: degrees(0) };
    expect(followReading(resting, undefined, readingAt(0, [0, 10, 0])).view).toEqual(resting);
  });

  it('lets go of the roll alone', () => {
    expect(withoutRoll(HELD)).toEqual({ ...HELD, roll: 0 });
  });
});

describe('the normal view while the device holds it', () => {
  const held = { ...EVERYTHING_MOVED, view: HELD };

  it('turns by sideways drags alone, as the normal view would', () => {
    const panned = MOTION_LOOK_VIEW.pan(held, { x: 90, y: -300 }, SQUARE).view;
    expect(panned).toEqual({ ...HELD, yaw: 33 });
    expect(MOTION_LOOK_VIEW.canPan(held)).toBe(true);
  });

  it('turns by the sideways arrows alone', () => {
    expect(MOTION_LOOK_VIEW.turn(held, turnOf(5, -5), SQUARE).view).toEqual({ ...HELD, yaw: 45 });
  });

  it('zooms about the centre wherever the pointer is', () => {
    const zoomed = MOTION_LOOK_VIEW.zoom(held, { steps: 1, focus: { x: 0.9, y: 0.1 } }, SQUARE);
    expect(zoomed.view).toEqual({ ...HELD, fieldOfView: 70 / 1.1 });
  });

  it('resets the heading and the zoom, the pitch and roll left to the device', () => {
    expect(MOTION_LOOK_VIEW.reset(held)).toEqual({
      ...held,
      view: { ...HELD, yaw: 0, fieldOfView: DEFAULT_VIEW.fieldOfView },
    });
  });

  it("takes a page's yaw and field of view, the pitch and roll left to the device", () => {
    const page = {
      yaw: degrees(200),
      pitch: degrees(-30),
      roll: degrees(0),
      fieldOfView: degrees(50),
    };
    expect(MOTION_LOOK_VIEW.place(held, page)).toEqual({
      ...held,
      view: { ...HELD, yaw: -160, fieldOfView: 50 },
    });
  });

  it('changes only the view, and draws the normal picture with its roll', () => {
    for (const framing of [
      MOTION_LOOK_VIEW.pan(held, { x: 40, y: -30 }, SQUARE),
      MOTION_LOOK_VIEW.zoom(held, { steps: 2, focus: { x: 0.7, y: 0.3 } }, SQUARE),
      MOTION_LOOK_VIEW.reset(held),
    ]) {
      expect(framing.panorama).toEqual(EVERYTHING_MOVED.panorama);
      expect(framing.lenses).toEqual(EVERYTHING_MOVED.lenses);
    }
    expect(MOTION_LOOK_VIEW.picture(held, SQUARE)).toEqual(rectilinearPicture(held, SQUARE));
    expect(MOTION_LOOK_VIEW.isStabilized).toBe(true);
  });
});
