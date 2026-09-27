import type { IdleWatcher } from './IdleWatcher';
import { queryShadow } from '../controls/controlParts';
import type { Player } from '../player/Player';
import { PLAYER_EVENT_NAMES } from '../player/PlayerEvents';

/**
 * The element the player's events are mirrored on, with the parts they update.
 */
export interface MirrorTarget {
  readonly element: HTMLElement;
  readonly shadow: ShadowRoot;
  readonly idle: IdleWatcher;
}

/**
 * The element's own bookkeeping runs before the events reach page listeners, so a listener sees
 * the attributes already matching the event it hears: the status and frame attributes, the idle
 * state and the error overlay. Every player event is then dispatched as a composed `CustomEvent`
 * of the same name, the payload in `detail`.
 */
export function mirrorPlayerEvents(player: Player, target: MirrorTarget): void {
  const { element, shadow, idle } = target;
  const errorMessage = queryShadow(shadow, '.error-message', HTMLElement);
  const errorCode = queryShadow(shadow, '.error-code', HTMLElement);
  player.events.on('statuschange', (status) => {
    element.dataset['status'] = status;
    idle.refresh();
  });
  player.events.on('frame', () => {
    element.dataset['hasFrame'] = '';
  });
  player.events.on('error', (error) => {
    errorMessage.textContent = error.message;
    errorCode.textContent = error.code;
  });
  for (const name of PLAYER_EVENT_NAMES) {
    player.events.on(name, (detail) => {
      element.dispatchEvent(new CustomEvent(name, { detail, composed: true }));
    });
  }
}
