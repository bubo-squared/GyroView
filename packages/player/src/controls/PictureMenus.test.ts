import {
  CalibrationVersion,
  DEFAULT_VIEW_MODE,
  seconds,
  TypedEmitter,
  type StabilizationMode,
  type ViewMode,
} from '@gyroview/core';
import { afterEach, describe, expect, it } from 'vitest';

import type { ChoiceMenuParts } from './ChoiceMenu';
import { PictureMenus, type PictureMenuParts, type PicturePlayer } from './PictureMenus';
import { Wording } from './Wording';
import type { PlayerEvents } from '../player/PlayerEvents';
import type { PlayerMetadata } from '../PlayerMetadata';
import { choiceItem, removeRenderedControls, renderControls } from '../test/controls';

/**
 * The picture settings as a player keeps them, announcing every change as the real one does.
 */
class FakePicturePlayer implements PicturePlayer {
  public readonly events = new TypedEmitter<PlayerEvents>();
  public metadata: PlayerMetadata | undefined;
  public viewMode: ViewMode = DEFAULT_VIEW_MODE;
  public stabilization: StabilizationMode = 'lock';

  public setViewMode(mode: ViewMode): void {
    this.viewMode = mode;
    this.events.emit('viewmodechange', mode);
  }

  public setStabilization(mode: StabilizationMode): void {
    this.stabilization = mode;
    this.events.emit('stabilizationchange', mode);
  }

  public becomeReady(hasGyro: boolean): void {
    this.metadata = metadataWith(hasGyro);
    this.events.emit('statuschange', 'ready');
  }

  public fail(): void {
    this.metadata = undefined;
    this.events.emit('statuschange', 'error');
  }
}

function metadataWith(hasGyro: boolean): PlayerMetadata {
  return {
    model: 'Insta360 X5',
    firmware: undefined,
    captureMode: undefined,
    layout: 'multi-track',
    layoutEvidence: [],
    tracks: [],
    calibrationVersion: CalibrationVersion.Mei,
    frameTimeSource: undefined,
    hasGyro,
    imuFrame: undefined,
    hasAudio: false,
    duration: seconds(3),
  };
}

function checkedChoice(parts: ChoiceMenuParts): string | undefined {
  return parts.popup.querySelector<HTMLElement>(':scope [aria-checked="true"]')?.dataset['choice'];
}

function item(parts: ChoiceMenuParts, choice: string): HTMLElement {
  return choiceItem(parts.popup, choice);
}

/**
 * The real controls' two picture menus, bound to a fake player.
 */
function pictureMenus(): { parts: PictureMenuParts; player: FakePicturePlayer } {
  const { root, parts } = renderControls();
  const player = new FakePicturePlayer();
  new PictureMenus(root, parts, { player, wording: new Wording() });
  return { parts, player };
}

afterEach(() => {
  removeRenderedControls();
});

describe('PictureMenus', () => {
  it('sets the mode chosen in each menu', () => {
    const { parts, player } = pictureMenus();
    item(parts.viewMode, 'equirectangular').click();
    item(parts.stabilization, 'horizon').click();
    expect(player.viewMode).toBe('equirectangular');
    expect(player.stabilization).toBe('horizon');
  });

  it('checks the modes in effect, however they were changed', () => {
    const { parts, player } = pictureMenus();
    expect(checkedChoice(parts.viewMode)).toBe('raw-lenses');
    expect(checkedChoice(parts.stabilization)).toBe('lock');
    player.setViewMode('normal');
    player.setStabilization('off');
    expect(checkedChoice(parts.viewMode)).toBe('normal');
    expect(checkedChoice(parts.stabilization)).toBe('off');
  });

  it('offers stabilization for a recording with a gyro, in the stitched view modes only', () => {
    const { parts, player } = pictureMenus();
    expect(parts.stabilization.button.hidden).toBe(true);
    player.becomeReady(true);
    expect(parts.stabilization.button.hidden).toBe(true);
    player.setViewMode('normal');
    expect(parts.stabilization.button.hidden).toBe(false);
    player.setViewMode('raw-lenses');
    expect(parts.stabilization.button.hidden).toBe(true);
    player.setViewMode('equirectangular');
    expect(parts.stabilization.button.hidden).toBe(false);
  });

  it('never offers stabilization for a recording without a gyro', () => {
    const { parts, player } = pictureMenus();
    player.setViewMode('normal');
    player.becomeReady(false);
    expect(parts.stabilization.button.hidden).toBe(true);
  });

  it('withdraws stabilization when the next load fails', () => {
    const { parts, player } = pictureMenus();
    player.setViewMode('normal');
    player.becomeReady(true);
    expect(parts.stabilization.button.hidden).toBe(false);
    player.fail();
    expect(parts.stabilization.button.hidden).toBe(true);
  });
});
