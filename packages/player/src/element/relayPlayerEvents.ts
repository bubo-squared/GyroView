import type { Player } from '../player/Player';
import { PLAYER_EVENT_NAMES } from '../player/PlayerEvents';

/**
 * Dispatches every player event from the element as a `CustomEvent` of the same name, the
 * payload in `detail`. Composed, so listeners outside a host's own shadow tree hear them.
 */
export function relayPlayerEvents(player: Player, element: HTMLElement): void {
  for (const name of PLAYER_EVENT_NAMES) {
    player.events.on(name, (detail) => {
      element.dispatchEvent(new CustomEvent(name, { detail, composed: true }));
    });
  }
}
