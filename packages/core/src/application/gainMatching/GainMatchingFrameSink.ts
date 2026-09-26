import { GainMatching } from './GainMatching';
import type { FrameSink, Presentation } from '../../ports/FrameSink';
import type { PictureRenderer } from '../../ports/PictureRenderer';
import type { SeamMeter } from '../../ports/SeamMeter';
import type { Vector3 } from '../../shared/math/Vector3';
import type { Seconds } from '../../shared/units/time';

export interface GainMatchingParts<Handle> {
  readonly sink: FrameSink<Handle>;
  /**
   * The renderer that draws what the sink is handed: it measures its seam and takes the gains,
   * which go back to one for each lens it draws when matching stops.
   */
  readonly renderer: Pick<
    PictureRenderer<Handle>,
    'createSeamMeter' | 'setLensGains' | 'lensCount'
  >;
}

/**
 * A matcher and the meter created for it, which live and go together.
 */
interface ActiveMatching {
  readonly meter: SeamMeter;
  readonly matching: GainMatching;
}

const UNIT_GAIN: Vector3 = [1, 1, 1];

/**
 * Use case: while enabled, keeps the lenses' exposure matched along the seam of the pictures the
 * sink draws, measuring after presentations. Off until enabled; disabled, the lenses show their
 * exposure as recorded (ADR 0012).
 */
export class GainMatchingFrameSink<Handle = unknown> implements FrameSink<Handle> {
  private active: ActiveMatching | undefined;
  private lastMediaTime: Seconds | undefined;

  public constructor(private readonly parts: GainMatchingParts<Handle>) {}

  public enable(): void {
    if (this.active) return;
    const { renderer } = this.parts;
    const meter = renderer.createSeamMeter();
    const matching = new GainMatching(meter, (gains) => {
      renderer.setLensGains(gains);
    });
    this.active = { meter, matching };
  }

  public disable(): void {
    this.stop();
    const unitGains = Array.from({ length: this.parts.renderer.lensCount }, () => UNIT_GAIN);
    this.parts.renderer.setLensGains(unitGains);
  }

  /**
   * One measurement and adjustment of the picture on screen right now, awaited: how tests
   * observe matching without waiting for the next scheduled measurement.
   */
  public async matchNow(): Promise<void> {
    if (this.lastMediaTime === undefined) return;
    await this.active?.matching.matchNow(this.lastMediaTime);
  }

  public present(presentation: Presentation<Handle>): void {
    this.parts.sink.present(presentation);
    this.lastMediaTime = presentation.mediaTime;
    this.active?.matching.afterPresent(presentation.mediaTime);
  }

  public dispose(): void {
    this.stop();
  }

  private stop(): void {
    this.active?.matching.stop();
    this.active?.meter.dispose();
    this.active = undefined;
  }
}
