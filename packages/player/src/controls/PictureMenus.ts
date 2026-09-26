import { viewModeRulesFor } from '@gyroview/core';

import { ChoiceMenu } from './ChoiceMenu';
import type { ControlParts } from './controlParts';
import { stabilizationModeOf, viewModeOf } from '../choices';
import type { Player } from '../player/Player';

export type PictureMenuParts = Pick<ControlParts, 'viewMode' | 'stabilization'>;

/**
 * The picture settings the menus show and change.
 */
export type PicturePlayer = Pick<
  Player,
  'events' | 'metadata' | 'viewMode' | 'stabilization' | 'setViewMode' | 'setStabilization'
>;

/**
 * The view mode and stabilization menus, each behind a button of its own. A choice sets the
 * player's mode, and each menu checks the mode in effect however it was last changed.
 * Stabilization is offered only where it changes the picture: a loaded recording with a gyro,
 * shown in a stitched view mode.
 */
export class PictureMenus {
  private readonly viewMode: ChoiceMenu;
  private readonly stabilization: ChoiceMenu;

  public constructor(
    root: ParentNode,
    parts: PictureMenuParts,
    private readonly player: PicturePlayer,
  ) {
    this.viewMode = new ChoiceMenu(root, parts.viewMode, (choice) => {
      const mode = viewModeOf(choice);
      if (mode) player.setViewMode(mode);
    });
    this.stabilization = new ChoiceMenu(root, parts.stabilization, (choice) => {
      const mode = stabilizationModeOf(choice);
      if (mode) player.setStabilization(mode);
    });
    player.events.on('viewmodechange', (mode) => {
      this.viewMode.markChosen(mode);
      this.offerStabilization();
    });
    player.events.on('stabilizationchange', (mode) => {
      this.stabilization.markChosen(mode);
    });
    player.events.on('statuschange', () => {
      this.offerStabilization();
    });
    this.viewMode.markChosen(player.viewMode);
    this.stabilization.markChosen(player.stabilization);
    this.offerStabilization();
  }

  private offerStabilization(): void {
    const hasGyro = this.player.metadata?.hasGyro === true;
    const isStabilized = viewModeRulesFor(this.player.viewMode).isStabilized;
    this.stabilization.setAvailable(hasGyro && isStabilized);
  }
}
