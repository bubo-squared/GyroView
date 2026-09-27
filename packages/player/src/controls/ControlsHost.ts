import type { Player } from '../player/Player';
import type { PlayerWarning } from '../player/PlayerEvents';

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
  warn(warning: PlayerWarning): void;
}
