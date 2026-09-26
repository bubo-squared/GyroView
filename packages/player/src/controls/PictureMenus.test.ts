import {
  CalibrationVersion,
  seconds,
  TypedEmitter,
  type StabilizationMode,
  type ViewMode,
} from '@gyroview/core';
import { describe, expect, it } from 'vitest';

import type { ChoiceMenuParts } from './ChoiceMenu';
import { PictureMenus, type PictureMenuParts, type PicturePlayer } from './PictureMenus';
import type { PlayerEvents } from '../player/PlayerEvents';
import type { PlayerMetadata } from '../PlayerMetadata';

/**
 * The picture settings as a player keeps them, announcing every change as the real one does.
 */
class FakePicturePlayer implements PicturePlayer {
  public readonly events = new TypedEmitter<PlayerEvents>();
  public metadata: PlayerMetadata | undefined;
  public viewMode: ViewMode = 'normal';
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

function choiceMenuParts(choices: readonly string[]): ChoiceMenuParts {
  const popup = document.createElement('div');
  popup.hidden = true;
  for (const choice of choices) {
    const item = document.createElement('button');
    item.setAttribute('role', 'menuitemradio');
    item.dataset['choice'] = choice;
    popup.append(item);
  }
  return { button: document.createElement('button'), popup };
}

function checkedChoice(parts: ChoiceMenuParts): string | undefined {
  return parts.popup.querySelector<HTMLElement>(':scope [aria-checked="true"]')?.dataset['choice'];
}

function item(parts: ChoiceMenuParts, choice: string): HTMLElement {
  const items = parts.popup.querySelectorAll<HTMLElement>(':scope [role="menuitemradio"]');
  const found = [...items].find((candidate) => candidate.dataset['choice'] === choice);
  if (!found) throw new Error(`no ${choice} item`);
  return found;
}

function pictureMenus(): { parts: PictureMenuParts; player: FakePicturePlayer } {
  const parts = {
    viewMode: choiceMenuParts(['normal', 'equirectangular', 'raw-lenses']),
    stabilization: choiceMenuParts(['off', 'lock', 'horizon', 'follow']),
  };
  const player = new FakePicturePlayer();
  new PictureMenus(document.createElement('div'), parts, player);
  return { parts, player };
}

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
    expect(checkedChoice(parts.viewMode)).toBe('normal');
    expect(checkedChoice(parts.stabilization)).toBe('lock');
    player.setViewMode('raw-lenses');
    player.setStabilization('off');
    expect(checkedChoice(parts.viewMode)).toBe('raw-lenses');
    expect(checkedChoice(parts.stabilization)).toBe('off');
  });

  it('offers stabilization for a recording with a gyro, in the stitched view modes only', () => {
    const { parts, player } = pictureMenus();
    expect(parts.stabilization.button.hidden).toBe(true);
    player.becomeReady(true);
    expect(parts.stabilization.button.hidden).toBe(false);
    player.setViewMode('raw-lenses');
    expect(parts.stabilization.button.hidden).toBe(true);
    player.setViewMode('equirectangular');
    expect(parts.stabilization.button.hidden).toBe(false);
  });

  it('never offers stabilization for a recording without a gyro', () => {
    const { parts, player } = pictureMenus();
    player.becomeReady(false);
    expect(parts.stabilization.button.hidden).toBe(true);
  });

  it('withdraws stabilization when the next load fails', () => {
    const { parts, player } = pictureMenus();
    player.becomeReady(true);
    player.fail();
    expect(parts.stabilization.button.hidden).toBe(true);
  });
});
