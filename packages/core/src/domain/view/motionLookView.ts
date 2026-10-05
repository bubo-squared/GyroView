import { withView, type Framing } from './Framing';
import { rectilinearPicture } from './normalView';
import { aspectOf, SCREEN_CENTRE } from './screenLayout';
import type { ScreenLook } from './screenLook';
import { lookAt, panView, zoomViewAt } from './viewGestures';
import type { ViewModeRules } from './ViewMode';
import { clampView, DEFAULT_VIEW, viewRotation, type ViewState } from './ViewState';
import { angleBetweenRotations } from '../../shared/math/Matrix3';
import { degrees, degreesToRadians, wrapHalfTurn } from '../../shared/units/angle';
import { milliseconds, type Milliseconds } from '../../shared/units/time';

/**
 * Where the device's screen looked, and when the browser said so (the event's time stamp).
 */
export interface DeviceReading {
  readonly look: ScreenLook;
  readonly at: Milliseconds;
}

/**
 * The view a reading turned the held view to, and the reading the next one is counted from.
 */
export interface DeviceHold {
  readonly view: ViewState;
  readonly reading: DeviceReading;
}

/**
 * Consecutive readings further apart than this are not one movement: iOS and Android count the
 * device's yaw from a new zero when the sensor starts again, and a hidden page hears no readings
 * at all. A main thread held up for longer, by a seek or a decoder starting, loses the turn made
 * meanwhile.
 */
const READING_GAP_MS = 500;
const READING_GAP = milliseconds(READING_GAP_MS);

/**
 * A hundredth of a degree: an eighth of a device pixel at the default field of view across a
 * phone's 1170 device pixels, and one pixel at the narrowest across 3000. A device at rest
 * reports noise of about this size, which would otherwise redraw the stitch at the sensor's rate.
 */
const UNSEEN_TURN_DEGREES = 0.01;
const UNSEEN_TURN = degreesToRadians(degrees(UNSEEN_TURN_DEGREES));

/**
 * Where a reading turns a view the device holds. The yaw only turns by as much as the device
 * turned since the reading it continues, so a drag, Reset view or a page's yaw move the heading
 * and the device carries on from there; after a gap, and at the first reading, the yaw stays.
 * The pitch and roll are the device's, level with the real horizon. A turn too small to see
 * leaves the view as it is and keeps counting from the look last shown, at the new reading's
 * time: a phone at rest draws nothing, and a slow drift lands in full once it shows.
 */
export function followReading(
  view: ViewState,
  previous: DeviceReading | undefined,
  reading: DeviceReading,
): DeviceHold {
  const { pitch, roll } = reading.look;
  if (!isOneMovement(previous, reading)) {
    return { view: clampView({ ...view, pitch, roll }), reading };
  }
  const yaw = degrees(view.yaw + wrapHalfTurn(degrees(reading.look.yaw - previous.look.yaw)));
  const turned = clampView({ ...view, yaw, pitch, roll });
  return isUnseenTurn(view, turned)
    ? { view, reading: { look: previous.look, at: reading.at } }
    : { view: turned, reading };
}

function isOneMovement(
  previous: DeviceReading | undefined,
  reading: DeviceReading,
): previous is DeviceReading {
  return previous !== undefined && reading.at - previous.at <= READING_GAP;
}

function isUnseenTurn(view: ViewState, turned: ViewState): boolean {
  return angleBetweenRotations(viewRotation(view), viewRotation(turned)) < UNSEEN_TURN;
}

/**
 * The view once the device lets go of it: level, looking where it looked.
 */
export function withoutRoll(view: ViewState): ViewState {
  return { ...view, roll: degrees(0) };
}

/**
 * The normal view while the device holds it (ADR 0040): the device gives the pitch and the roll,
 * so drags and the arrows turn the heading alone, a zoom narrows about the centre, and a page's
 * view sets the heading and the zoom.
 */
export const MOTION_LOOK_VIEW: ViewModeRules = {
  isStabilized: true,
  canPan: () => true,
  pan: (framing, delta, { viewport }) =>
    withView(framing, panView(framing.view, { x: delta.x, y: 0 }, viewport)),
  turn: (framing, turn) => {
    const { view } = framing;
    return withView(framing, lookAt(view, degrees(view.yaw + turn.yaw), view.pitch));
  },
  zoom: (framing, zoom, { viewport }) =>
    withView(
      framing,
      zoomViewAt(framing.view, { steps: zoom.steps, focus: SCREEN_CENTRE }, aspectOf(viewport)),
    ),
  reset: (framing) =>
    withHeading(framing, {
      ...framing.view,
      yaw: degrees(0),
      fieldOfView: DEFAULT_VIEW.fieldOfView,
    }),
  place: withHeading,
  picture: rectilinearPicture,
};

/**
 * The held view with the yaw and field of view of `view`, the device's pitch and roll kept.
 */
function withHeading(framing: Framing, view: ViewState): Framing {
  const { yaw, fieldOfView } = view;
  return withView(framing, clampView({ ...framing.view, yaw, fieldOfView }));
}
