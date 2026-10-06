import type { Player } from '../player/Player';

/**
 * Binds Reset view, which brings the current view mode back to how it starts.
 */
export function bindResetViewButton(
  button: HTMLButtonElement,
  player: Pick<Player, 'resetView'>,
): void {
  button.addEventListener('click', () => {
    player.resetView();
  });
}
