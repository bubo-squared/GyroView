import { closeFramePair, type FramePair } from '../../ports/FramePair';
import type { FrameSink, Presentation } from '../../ports/FrameSink';
import { asGyroViewError, type GyroViewError } from '../../shared/errors/GyroViewError';
import type { Seconds } from '../../shared/units/time';

/**
 * The pair on screen: handed to the sink, kept open until the next one replaces it, and handed
 * again on request. A sink that cannot draw (a renderer the GPU refused) is reported, never
 * unheard.
 */
export class PictureOnScreen<Handle> {
  private presented: Presentation<Handle> | undefined;

  public constructor(
    private readonly sink: FrameSink<Handle>,
    private readonly onFailure: (error: GyroViewError) => void,
  ) {}

  public get hasPicture(): boolean {
    return this.presented !== undefined;
  }

  /**
   * When the pair on screen shows in the recording, if one is.
   */
  public get timestamp(): Seconds | undefined {
    return this.presented?.pair.timestamp;
  }

  /**
   * Replaces the pair on screen with `pair`, drawn at `mediaTime`; false when it could not be
   * drawn, which has been reported.
   */
  public show(pair: FramePair<Handle>, mediaTime: Seconds): boolean {
    this.clear();
    this.presented = { pair, mediaTime };
    return this.draw(this.presented);
  }

  public redraw(): void {
    if (this.presented) this.draw(this.presented);
  }

  public clear(): void {
    if (this.presented) closeFramePair(this.presented.pair);
    this.presented = undefined;
  }

  private draw(presentation: Presentation<Handle>): boolean {
    try {
      this.sink.present(presentation);
      return true;
    } catch (error) {
      // A GPU that gave up, told apart from a stream that broke.
      this.onFailure(
        asGyroViewError(error, 'render-unavailable', 'the picture could not be drawn'),
      );
      return false;
    }
  }
}
