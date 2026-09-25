import type { Player } from '../player/Player';
import type { Quality } from '../PlayerSource';

/**
 * What the controls ask of the element beyond the player itself.
 */
export interface ControlsHost {
  readonly player: Player;
  /**
   * Plays or pauses; the element reports a refused start.
   */
  togglePlay(): void;
  toggleFullscreen(): void;
  /**
   * A quality choice means a reload; the element owns that.
   */
  changeQuality(quality: Quality): void;
  warn(message: string): void;
}
