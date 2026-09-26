import { queryControlParts } from './controlParts';
import type { ControlsHost } from './ControlsHost';
import { SeekBar } from './SeekBar';
import { SettingsMenu } from './SettingsMenu';
import { SoundControls } from './SoundControls';
import { TransportButtons } from './TransportButtons';

/**
 * Binds the control bar in the shadow tree: transport buttons, seek bar, sound and the settings
 * menu, each driving the player and showing its state. They live as long as the element: every
 * listener sits on its shadow tree or its player.
 */
export function bindControlsBar(root: ParentNode, host: ControlsHost): void {
  const parts = queryControlParts(root);
  new SettingsMenu(root, parts, host);
  new TransportButtons(parts, host);
  new SeekBar(parts, host);
  new SoundControls(parts, host.player);
}
