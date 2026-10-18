import type { MountedMotion } from '../mounting/Mounting';
import { multiplyMatrices, transposeMatrix, type Matrix3 } from '../../../shared/math/Matrix3';
import { quaternionToMatrix } from '../../../shared/math/Quaternion';
import { seconds, type Seconds } from '../../../shared/units/time';

/**
 * Which row of each lens's image the sensor reads first. Rows run down the lens's window on the
 * calibration canvas, as its pixels do.
 */
export type RowOrder = 'top-first' | 'bottom-first';

/**
 * How a camera's sensors read a frame row by row: over `readout`, in `rowOrder`, every lens
 * alike. A frame's time is its middle row's (ADR 0034), half the readout before and after it.
 */
export interface RollingShutter {
  readonly readout: Seconds;
  readonly rowOrder: RowOrder;
}

/**
 * The corrections a frame carries, its rows from first in the window to last at even steps: an
 * odd count, so the middle row, at the frame's time, is corrected by nothing.
 */
export const ROW_CORRECTION_COUNT = 9;

/**
 * Where a frame's time lies down its rows: the middle row's (ADR 0034).
 */
const FRAME_TIME_ROW = 0.5;

/**
 * Keyed by the whole model name, as the IMU frames are: a camera's row order is measured on a
 * recording of it (ADR 0046), never assumed.
 */
const ROW_ORDERS_BY_MODEL: ReadonlyMap<string, RowOrder> = new Map([
  ['Insta360 OneR', 'top-first'],
]);

/**
 * What the info record says about the camera, as far as its rolling shutter depends on it.
 */
export interface RollingShutterHints {
  readonly model: string | undefined;
  readonly readoutTime: Seconds | undefined;
}

/**
 * The rolling shutter to correct, for a camera whose row order is measured and whose info record
 * states its readout; nothing otherwise, and its frames turn whole.
 */
export function rollingShutterFor(info: RollingShutterHints): RollingShutter | undefined {
  const rowOrder = ROW_ORDERS_BY_MODEL.get(info.model?.trim() ?? '');
  const readout = info.readoutTime;
  return rowOrder && readout !== undefined && readout > 0 ? { readout, rowOrder } : undefined;
}

/**
 * For each of {@link ROW_CORRECTION_COUNT} rows down a lens's window, the rotation taking a
 * direction in the body as it was at the frame's `time` into the body as it was when that row was
 * read: the camera turned between the two, so the world a row shows lies that much elsewhere.
 * Every stabilization mode turns the picture at the frame's time, so the corrections apply after
 * it, whatever the mode.
 */
export function rowCorrectionsAt(
  motion: MountedMotion,
  time: Seconds,
  shutter: RollingShutter,
): Matrix3[] {
  const { orientations, mounting } = motion;
  const atTime = quaternionToMatrix(orientations.orientationAt(time));
  const fromBody = transposeMatrix(mounting.toBody);
  const last = ROW_CORRECTION_COUNT - 1;
  return Array.from({ length: ROW_CORRECTION_COUNT }, (_, index) => {
    const step = shutter.rowOrder === 'top-first' ? index : last - index;
    const rowTime = seconds(time + (step / last - FRAME_TIME_ROW) * shutter.readout);
    const atRow = quaternionToMatrix(orientations.orientationAt(rowTime));
    // Body at the frame's time, to the upright frame, to the world, back into the upright frame
    // and the body as they stood when the row was read.
    const uprightTurn = multiplyMatrices(transposeMatrix(atRow), atTime);
    return multiplyMatrices(mounting.toBody, multiplyMatrices(uprightTurn, fromBody));
  });
}
