import { queryControlParts } from './controlParts';
import type { ControlsHost } from './ControlsHost';
import { MotionLookButton } from './MotionLookButton';
import { PictureMenus } from './PictureMenus';
import { SeekBar } from './SeekBar';
import { SoundControls } from './SoundControls';
import { TransportButtons } from './TransportButtons';
import { bindViewButtons } from './viewButtons';

/**
 * Binds the control bar in the shadow tree: transport buttons, seek bar, sound, Reset view and
 * Fullscreen, the view mode and stabilization menus and the motion look toggle, each driving the
 * player and showing its state. They live as long as the element: every listener sits on its
 * shadow tree or its player.
 */
export function bindControlsBar(root: ParentNode, host: ControlsHost): void {
  const parts = queryControlParts(root);
  new TransportButtons(parts, host);
  bindViewButtons(parts, host);
  new SeekBar(parts, host);
  new SoundControls(parts, host.player);
  new PictureMenus(root, parts, { player: host.player, wording: host.wording });
  new MotionLookButton(parts, host.player);
}
