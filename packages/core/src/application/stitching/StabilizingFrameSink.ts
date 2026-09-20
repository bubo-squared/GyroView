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
  private stabilizerValue: Stabilizer = new OffStabilization();

  public constructor(private readonly parts: StabilizingParts<Handle>) {}

  public get stabilizer(): Stabilizer {
    return this.stabilizerValue;
  }

  public setStabilizer(stabilizer: Stabilizer): void {
    this.stabilizerValue = stabilizer;
  }

  public present(presentation: Presentation<Handle>): void {
    const time = this.exposureTimeOf(presentation);
    const orientation = this.parts.orientations.orientationAt(time);
    this.parts.sink.setStabilization(this.stabilizerValue.rotationFor(orientation, time));
    this.parts.sink.present(presentation);
  }

  private exposureTimeOf(presentation: Presentation<Handle>): Seconds {
    const { frameTimes } = this.parts;
    return frameTimes && presentation.frameIndex !== undefined
      ? frameTimes.frameAt(presentation.frameIndex).midExposureVideoTime
      : presentation.pair.timestamp;
  }
}
