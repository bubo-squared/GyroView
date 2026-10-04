import { clamp } from '../../shared/math/clamp';
import {
  multiplyMatrices,
  rotationAboutX,
  rotationAboutY,
  rotationAboutZ,
  type Matrix3,
} from '../../shared/math/Matrix3';
import {
  degrees,
  degreesToRadians,
  radians,
  radiansToDegrees,
  type Degrees,
  type Radians,
} from '../../shared/units/angle';

/**
 * How the viewer holds the device, as the browser reports it (W3C DeviceOrientation Event
 * Specification, section 4.1): the device frame (x right across the screen, y up it, z out of it
 * toward the viewer) turned from a frame whose z points up by `alpha` about z, then `beta` about
 * the new x, then `gamma` about the newest y; and how far the screen's content is turned from the
 * device's natural orientation, counterclockwise (`screen.orientation.angle`).
 */
export interface DeviceAttitude {
  readonly alpha: Degrees;
  readonly beta: Degrees;
  readonly gamma: Degrees;
  readonly screenAngle: Degrees;
}

/**
 * Where a screen held up as a window looks, in the view's terms (`ViewState`): yaw positive to
 * the right, pitch positive up, roll positive clockwise. The yaw counts from the device's own
 * heading reference, which the browser chooses (it is arbitrary on iOS), so only its changes
 * mean anything.
 */
export interface ScreenLook {
  readonly yaw: Degrees;
  readonly pitch: Degrees;
  readonly roll: Degrees;
}

/**
 * View space (x right, y down, z into the screen) into the screen's frame (x right, y up, z out
 * of the screen): the viewer looks through the screen, out of its back.
 */
const VIEW_TO_SCREEN: Matrix3 = [1, 0, 0, 0, -1, 0, 0, 0, -1];

/**
 * The browser's world (x east, y north, z up) into the view's (x right, y down, z forward), north
 * standing for forward: the yaw only counts changes, so any horizontal direction would do.
 */
const WORLD_TO_VIEW: Matrix3 = [1, 0, 0, 0, 0, -1, 0, 1, 0];

/**
 * Below this cosine of the pitch the screen looks straight up or down, where only the sum or the
 * difference of yaw and roll is defined, and each one alone would be read from rounding noise:
 * the look then takes the turn as yaw alone, within a millionth of a radian of the screen.
 */
const POLE_COSINE = 1e-6;

/**
 * The rotation that turns view-space directions into the view's world for a device held this
 * way, as `viewRotation` turns them for a view.
 */
export function screenRotationOf(attitude: DeviceAttitude): Matrix3 {
  const device = multiplyMatrices(
    multiplyMatrices(
      rotationAbout(rotationAboutZ, attitude.alpha),
      rotationAbout(rotationAboutX, attitude.beta),
    ),
    rotationAbout(rotationAboutY, attitude.gamma),
  );
  const screen = multiplyMatrices(
    rotationAbout(rotationAboutZ, degrees(-attitude.screenAngle)),
    VIEW_TO_SCREEN,
  );
  return multiplyMatrices(multiplyMatrices(WORLD_TO_VIEW, device), screen);
}

/**
 * The yaw, pitch and roll whose `viewRotation` is the screen's rotation: the rotation
 * `Ry(yaw) Rx(pitch) Rz(roll)` read back from its entries.
 */
export function screenLookOf(attitude: DeviceAttitude): ScreenLook {
  const [m00, , m02, m10, m11, m12, m20, , m22] = screenRotationOf(attitude);
  const pitch = angleOf(Math.asin(-clamp(m12, -1, 1)));
  return Math.hypot(m10, m11) < POLE_COSINE
    ? { yaw: angleOf(Math.atan2(-m20, m00)), pitch, roll: degrees(0) }
    : { yaw: angleOf(Math.atan2(m02, m22)), pitch, roll: angleOf(Math.atan2(m10, m11)) };
}

function rotationAbout(rotation: (angle: Radians) => Matrix3, angle: Degrees): Matrix3 {
  return rotation(degreesToRadians(angle));
}

function angleOf(value: number): Degrees {
  return radiansToDegrees(radians(value));
}
