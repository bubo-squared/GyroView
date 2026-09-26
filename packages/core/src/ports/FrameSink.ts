import type { FramePair } from './FramePair';
import type { Matrix3 } from '../shared/math/Matrix3';
import type { Seconds } from '../shared/units/time';

/**
 * What the sink is told with every presented pair, beyond the pictures themselves.
 */
export interface Presentation<Handle = unknown> {
  readonly pair: FramePair<Handle>;
  readonly mediaTime: Seconds;
}

/**
 * Port: displays frame pairs. The implementation uploads the frames; the session keeps
 * ownership of the pair and closes it once a newer pair has been presented.
 */
export interface FrameSink<Handle = unknown> {
  present(presentation: Presentation<Handle>): void;
}

/**
 * A sink that can turn the whole picture: `rotation` takes directions from the stabilized
 * reference frame the viewer looks around in into the camera body frame, and is applied after
 * the view rotation and before the lens poses.
 */
export interface StabilizableFrameSink<Handle = unknown> extends FrameSink<Handle> {
  setStabilization(rotation: Matrix3): void;
}
