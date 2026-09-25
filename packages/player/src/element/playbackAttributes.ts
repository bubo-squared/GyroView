import { STABILIZATION_MODES, VIEW_MODES } from '@gyroview/core';

import { PlaybackAttribute } from './attributeNames';
import { ignoredChoiceWarning, isBooleanAttributeSet, shouldMatchGains } from './attributes';
import { choiceOf } from '../choices';
import type { Player } from '../player/Player';

export interface PlaybackTargets {
  readonly player: Player;
  readonly posterImage: HTMLImageElement;
  readonly warn: (message: string) => void;
}

type AttributeApplier = (targets: PlaybackTargets, value: string | null) => void;

/**
 * An attribute naming one of `choices`: applied when known, warned about otherwise, as an unknown
 * `quality` is. Removing the attribute leaves the setting as it is.
 */
function choiceApplier<Choice extends string>(
  attribute: string,
  choices: readonly Choice[],
  apply: (player: Player, choice: Choice) => void,
): AttributeApplier {
  return ({ player, warn }, value): void => {
    const choice = choiceOf(value, choices);
    if (choice) apply(player, choice);
    else if (value !== null) warn(ignoredChoiceWarning(attribute, value, choices));
  };
}

/**
 * What each attribute that changes playback without reloading does.
 */
const APPLIERS: ReadonlyMap<string, AttributeApplier> = new Map<string, AttributeApplier>([
  [
    PlaybackAttribute.Stabilization,
    choiceApplier(PlaybackAttribute.Stabilization, STABILIZATION_MODES, (player, mode) => {
      player.setStabilization(mode);
    }),
  ],
  [
    PlaybackAttribute.ViewMode,
    choiceApplier(PlaybackAttribute.ViewMode, VIEW_MODES, (player, mode) => {
      player.setViewMode(mode);
    }),
  ],
  [
    PlaybackAttribute.Muted,
    ({ player }, value): void => {
      player.setMuted(isBooleanAttributeSet(value));
    },
  ],
  [
    PlaybackAttribute.Loop,
    ({ player }, value): void => {
      player.setLooping(isBooleanAttributeSet(value));
    },
  ],
  [
    PlaybackAttribute.Poster,
    ({ posterImage }, value): void => {
      posterImage.src = value ?? '';
    },
  ],
  [
    PlaybackAttribute.GainMatch,
    ({ player }, value): void => {
      player.setGainMatching(shouldMatchGains(value));
    },
  ],
]);

export function applyPlaybackAttribute(
  targets: PlaybackTargets,
  name: string,
  value: string | null,
): void {
  APPLIERS.get(name)?.(targets, value);
}
