import type { Player } from '../player/Player';
import type { PlayerEvents } from '../player/PlayerEvents';

const RELAYED_EVENTS: readonly (keyof PlayerEvents & string)[] = [
  'statuschange',
  'ready',
  'play',
  'playing',
  'waiting',
  'pause',
  'ended',
  'timeupdate',
  'seeking',
  'seeked',
  'frame',
  'viewchange',
  'viewmodechange',
  'stabilizationchange',
  'volumechange',
  'warning',
  'error',
];

/**
 * Dispatches every player event from the element as a `CustomEvent` of the same name, the
 * payload in `detail`. Composed, so listeners outside a host's own shadow tree hear them.
 */
export function relayPlayerEvents(player: Player, element: HTMLElement): void {
  for (const name of RELAYED_EVENTS) {
    player.events.on(name, (detail) => {
      element.dispatchEvent(new CustomEvent(name, { detail, composed: true }));
    });
  }
}
