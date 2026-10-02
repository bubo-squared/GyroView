import { rotationIntoBody, type MountedMotion } from '../../domain/motion/mounting/Mounting';
import type { Stabilizer } from '../../domain/motion/stabilization/Stabilizer';
import { OffStabilization } from '../../domain/motion/stabilization/stabilizers';
import type { FrameTimes } from '../../domain/motion/timing/FrameTimes';
import type { FrameSink, Presentation } from '../../ports/FrameSink';
import type { PictureRenderer } from '../../ports/PictureRenderer';
import type { Seconds } from '../../shared/units/time';

export interface StabilizingParts<Handle> {
  /**
   * What draws the picture, turned as each presentation's orientation says.
   */
  readonly sink: Pick<PictureRenderer<Handle>, 'present' | 'setStabilization'>;
  /**
   * The orientation of the camera's upright frame, which the stabilizer turns the picture by, and
   * the mounting that turns the stabilizer's rotation from that frame into the body the lenses are
   * posed in.
   */
  readonly motion: MountedMotion;
  /**
   * Gives each frame its mid-exposure time; without it the frame's track timestamp stands in.
   */
  readonly frameTimes: FrameTimes | undefined;
}

/**
 * Use case: before every presentation, looks up the camera's orientation at the frame's
 * exposure and tells the sink how to turn the picture for the current stabilization mode.
 */
export class StabilizingFrameSink<Handle = unknown> implements FrameSink<Handle> {
  private stabilizer: Stabilizer = new OffStabilization();

  public constructor(private readonly parts: StabilizingParts<Handle>) {}

  public setStabilizer(stabilizer: Stabilizer): void {
    this.stabilizer = stabilizer;
  }

  public present(presentation: Presentation<Handle>): void {
    const time = this.exposureTimeOf(presentation);
    const { orientations, mounting } = this.parts.motion;
    const rotation = this.stabilizer.nextRotation(orientations.orientationAt(time), time);
    this.parts.sink.setStabilization(rotationIntoBody(mounting, rotation));
    this.parts.sink.present(presentation);
  }

  /**
   * The frame's mid-exposure time, or its track timestamp when there are no frame times to say.
   */
  private exposureTimeOf(presentation: Presentation<Handle>): Seconds {
    const { timestamp } = presentation.pair;
    return this.parts.frameTimes?.midExposureAt(timestamp) ?? timestamp;
  }
}
