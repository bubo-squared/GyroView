import type { Player } from '../player/Player';
import type { Wording } from './Wording';
import type { PlayerWarning } from '../player/PlayerEvents';

/**
 * What the controls ask of the element beyond the player itself.
 */
export interface ControlsHost {
  readonly player: Player;
  /**
   * The words the controls say, the page's where it gave its own.
   */
  readonly wording: Wording;
  /**
   * Plays or pauses; the element reports a refused start.
   */
  togglePlay(): void;
  toggleFullscreen(): void;
  warn(warning: PlayerWarning): void;
}
