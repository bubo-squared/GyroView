import { queryControlParts } from './controlParts';
import type { ControlsHost } from './ControlsHost';
import { FullscreenButton } from './FullscreenButton';
import { MotionLookButton } from './MotionLookButton';
import { PictureMenus } from './PictureMenus';
import { bindResetViewButton } from './resetViewButton';
import { SeekBar } from './SeekBar';
import { SoundControls } from './SoundControls';
import { TransportButtons } from './TransportButtons';

/**
 * What the element tells the bar beyond the player's events.
 */
export interface ControlsBar {
  /**
   * The element entered or left fullscreen, or the pinned fill.
   */
  fullscreenChanged(): void;
}

/**
 * Binds the control bar in the shadow tree: transport buttons, seek bar, sound, Reset view and
 * Fullscreen, the view mode and stabilization menus and the motion look toggle, each driving the
 * player and showing its state. They live as long as the element: every listener sits on its
 * shadow tree or its player.
 */
export function bindControlsBar(root: ParentNode, host: ControlsHost): ControlsBar {
  const parts = queryControlParts(root);
  new TransportButtons(parts, host);
  bindResetViewButton(parts.resetView, host.player);
  const fullscreen = new FullscreenButton(parts.fullscreen, host);
  new SeekBar(parts, host);
  new SoundControls(parts, host.player);
  new PictureMenus(root, parts, { player: host.player, wording: host.wording });
  new MotionLookButton(parts, host.player);
  return {
    fullscreenChanged: (): void => {
      fullscreen.reflect();
    },
  };
}
