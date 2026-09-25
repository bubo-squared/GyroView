import { queryControlParts } from './controlParts';
import type { ControlsHost } from './ControlsHost';
import { SeekBar } from './SeekBar';
import { SettingsMenu } from './SettingsMenu';
import { SoundControls } from './SoundControls';
import { TransportButtons } from './TransportButtons';
import type { Quality } from '../PlayerSource';

/**
 * The control bar in the shadow tree: transport buttons, seek bar, sound and the settings menu,
 * each bound to the player and showing its state. They live as long as the element: every
 * listener sits on its shadow tree or its player.
 */
export class ControlsBar {
  private readonly settingsMenu: SettingsMenu;

  public constructor(root: ParentNode, host: ControlsHost) {
    const parts = queryControlParts(root);
    this.settingsMenu = new SettingsMenu(root, parts, host);
    new TransportButtons(parts, host);
    new SeekBar(parts, host);
    new SoundControls(parts, host.player);
  }

  public setQuality(quality: Quality): void {
    this.settingsMenu.setQuality(quality);
  }
}
