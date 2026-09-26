import type { ControlParts } from './controlParts';
import type { ControlsHost } from './ControlsHost';
import type { Player } from '../player/Player';

type ViewButtonParts = Pick<ControlParts, 'resetView' | 'fullscreen'>;

/**
 * What the buttons change: how the picture is seen, not what plays.
 */
interface ViewButtonsHost extends Pick<ControlsHost, 'toggleFullscreen'> {
  readonly player: Pick<Player, 'resetView'>;
}

/**
 * Binds Reset view, which brings the current view mode back to how it starts, and Fullscreen.
 */
export function bindViewButtons(parts: ViewButtonParts, host: ViewButtonsHost): void {
  parts.resetView.addEventListener('click', () => {
    host.player.resetView();
  });
  parts.fullscreen.addEventListener('click', () => {
    host.toggleFullscreen();
  });
}
