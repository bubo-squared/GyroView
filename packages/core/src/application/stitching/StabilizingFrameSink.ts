import type { OrientationTrack } from '../../domain/motion/orientation/OrientationTrack';
import type { Stabilizer } from '../../domain/motion/stabilization/Stabilizer';
import { OffStabilization } from '../../domain/motion/stabilization/stabilizers';
import type { FrameTimes } from '../../domain/motion/timing/FrameTimes';
import type { FrameSink, Presentation, StabilizableFrameSink } from '../../ports/FrameSink';
import type { Seconds } from '../../shared/units/time';

export interface StabilizingParts<Handle> {
  readonly sink: StabilizableFrameSink<Handle>;
  readonly orientations: OrientationTrack;
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
    const orientation = this.parts.orientations.orientationAt(time);
    this.parts.sink.setStabilization(this.stabilizer.nextRotation(orientation, time));
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
