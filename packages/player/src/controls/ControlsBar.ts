import { queryControlParts } from './controlParts';
import type { ControlsHost, ControlWidget } from './ControlsHost';
import { SeekBar } from './SeekBar';
import { SettingsMenu } from './SettingsMenu';
import { SoundControls } from './SoundControls';
import { TransportButtons } from './TransportButtons';
import type { Quality } from '../PlayerSource';

/**
 * The control bar in the shadow tree: transport buttons, seek bar, sound and the settings menu,
 * each bound to the player and showing its state.
 */
export class ControlsBar {
  private readonly settingsMenu: SettingsMenu;
  private readonly widgets: readonly ControlWidget[];

  public constructor(root: ParentNode, host: ControlsHost) {
    const parts = queryControlParts(root);
    this.settingsMenu = new SettingsMenu(root, parts, host);
    this.widgets = [
      new TransportButtons(parts, host),
      new SeekBar(parts, host),
      new SoundControls(parts, host.player),
      this.settingsMenu,
    ];
  }

  public setQuality(quality: Quality): void {
    this.settingsMenu.setQuality(quality);
  }

  public dispose(): void {
    for (const widget of this.widgets) widget.dispose();
  }
}
