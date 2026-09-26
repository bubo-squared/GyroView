import type { ControlParts } from './controlParts';
import type { ControlsHost } from './ControlsHost';
import { qualityOf, stabilizationModeOf, viewModeOf } from '../choices';
import type { Player } from '../player/Player';
import type { Quality } from '../PlayerSource';

export type MenuParts = Pick<
  ControlParts,
  'settings' | 'menu' | 'stabilization' | 'viewMode' | 'qualityRow' | 'quality'
>;

/**
 * What the menu shows and changes.
 */
export interface MenuHost extends Pick<ControlsHost, 'changeQuality'> {
  readonly player: Pick<
    Player,
    'events' | 'stabilization' | 'viewMode' | 'setStabilization' | 'setViewMode'
  >;
}

/**
 * The settings button and its menu: stabilization, view mode and, when the recording has a
 * proxy, quality. Opens on the button, closes on Escape or a press outside, and shows each
 * setting as it is now.
 */
export class SettingsMenu {
  public constructor(
    root: ParentNode,
    private readonly parts: MenuParts,
    private readonly host: MenuHost,
  ) {
    this.bindOpening(root);
    this.bindChoices();
    const { events } = this.player;
    events.on('stabilizationchange', (mode) => {
      parts.stabilization.value = mode;
    });
    events.on('viewmodechange', (mode) => {
      parts.viewMode.value = mode;
    });
    events.on('ready', (metadata) => {
      parts.qualityRow.hidden = metadata.proxyName === undefined;
    });
    parts.stabilization.value = this.player.stabilization;
    parts.viewMode.value = this.player.viewMode;
  }

  private get player(): MenuHost['player'] {
    return this.host.player;
  }

  public setQuality(quality: Quality): void {
    this.parts.quality.value = quality;
  }

  private bindOpening(root: ParentNode): void {
    const { settings, menu } = this.parts;
    settings.addEventListener('click', () => {
      this.setOpen(menu.hidden);
    });
    root.addEventListener('pointerdown', (event) => {
      const isInside = event.composedPath().some((node) => node === menu || node === settings);
      if (!isInside) this.setOpen(false);
    });
    root.addEventListener('keydown', (event) => {
      if (event instanceof KeyboardEvent && event.key === 'Escape') this.setOpen(false);
    });
  }

  private bindChoices(): void {
    const { stabilization, viewMode, quality } = this.parts;
    stabilization.addEventListener('change', () => {
      const mode = stabilizationModeOf(stabilization.value);
      if (mode) this.player.setStabilization(mode);
    });
    viewMode.addEventListener('change', () => {
      const mode = viewModeOf(viewMode.value);
      if (mode) this.player.setViewMode(mode);
    });
    quality.addEventListener('change', () => {
      const chosen = qualityOf(quality.value);
      if (chosen) this.host.changeQuality(chosen);
    });
  }

  private setOpen(isOpen: boolean): void {
    this.parts.menu.hidden = !isOpen;
    this.parts.settings.setAttribute('aria-expanded', String(isOpen));
  }
}
