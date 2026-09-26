import { GainMatching } from './GainMatching';
import type { FrameSink, Presentation } from '../../ports/FrameSink';
import type { PictureRenderer } from '../../ports/PictureRenderer';
import type { Seconds } from '../../shared/units/time';

export interface GainMatchingParts<Handle> {
  readonly sink: FrameSink<Handle>;
  /**
   * The renderer that draws what the sink is handed: it measures its seam and takes the gains.
   */
  readonly renderer: Pick<PictureRenderer<Handle>, 'createSeamMeter' | 'setLensGains'>;
}

/**
 * Use case: while enabled, keeps the lenses' exposure matched along the seam of the pictures the
 * sink draws, measuring after presentations. Off until enabled; disabling leaves the last gains
 * in place.
 */
export class GainMatchingFrameSink<Handle = unknown> implements FrameSink<Handle> {
  private matching: GainMatching | undefined;
  private lastMediaTime: Seconds | undefined;

  public constructor(private readonly parts: GainMatchingParts<Handle>) {}

  public enable(): void {
    const { renderer } = this.parts;
    this.matching ??= new GainMatching(renderer.createSeamMeter(), (gains) => {
      renderer.setLensGains(gains);
    });
  }

  public disable(): void {
    this.matching?.dispose();
    this.matching = undefined;
  }

  /**
   * One measurement and adjustment of the picture on screen right now, for a still frame.
   */
  public async matchNow(): Promise<void> {
    if (this.lastMediaTime === undefined) return;
    await this.matching?.matchNow(this.lastMediaTime);
  }

  public present(presentation: Presentation<Handle>): void {
    this.parts.sink.present(presentation);
    this.lastMediaTime = presentation.mediaTime;
    this.matching?.afterPresent(presentation.mediaTime);
  }

  public dispose(): void {
    this.disable();
  }
}
