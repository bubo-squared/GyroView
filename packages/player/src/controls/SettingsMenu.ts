import type { ControlParts } from './controlParts';

import { stabilizationModeOf, viewModeOf } from '../choices';
import type { Player } from '../player/Player';

type MenuParts = Pick<ControlParts, 'settings' | 'menu' | 'stabilization' | 'viewMode'>;

/**
 * What the menu shows and changes.
 */
interface MenuHost {
  readonly player: Pick<
    Player,
    'events' | 'stabilization' | 'viewMode' | 'setStabilization' | 'setViewMode'
  >;
}

/**
 * The settings button and its menu: stabilization and view mode. Opens on the button, closes on
 * Escape or a press outside, and shows each setting as it is now.
 */
export class SettingsMenu {
  public constructor(
    root: ParentNode,
    private readonly parts: MenuParts,
    private readonly host: MenuHost,
  ) {
    this.bindOpening(root);
    this.bindChoices();
    const { events } = this.host.player;
    events.on('stabilizationchange', (mode) => {
      parts.stabilization.value = mode;
    });
    events.on('viewmodechange', (mode) => {
      parts.viewMode.value = mode;
    });
    parts.stabilization.value = this.host.player.stabilization;
    parts.viewMode.value = this.host.player.viewMode;
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
      const isEscape = event instanceof KeyboardEvent && event.key === 'Escape';
      if (!isEscape || menu.hidden) return;
      // An open menu takes the Escape; leaving fullscreen waits for the next one.
      this.setOpen(false);
      event.stopPropagation();
    });
  }

  private bindChoices(): void {
    const { stabilization, viewMode } = this.parts;
    stabilization.addEventListener('change', () => {
      const mode = stabilizationModeOf(stabilization.value);
      if (mode) this.host.player.setStabilization(mode);
    });
    viewMode.addEventListener('change', () => {
      const mode = viewModeOf(viewMode.value);
      if (mode) this.host.player.setViewMode(mode);
    });
  }

  private setOpen(isOpen: boolean): void {
    this.parts.menu.hidden = !isOpen;
    this.parts.settings.setAttribute('aria-expanded', String(isOpen));
  }
}
