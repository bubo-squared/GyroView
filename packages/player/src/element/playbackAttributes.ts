import { STABILIZATION_MODES, VIEW_MODES } from '@gyroview/core';

import { PlaybackAttribute } from './attributeNames';
import { ignoredChoiceWarning, isBooleanAttributeSet, shouldMatchGains } from './attributes';
import { choiceOf } from '../choices';
import type { Player } from '../player/Player';
import type { PlayerWarning } from '../player/PlayerEvents';

export interface PlaybackTargets {
  readonly player: Player;
  readonly posterImage: HTMLImageElement;
  readonly warn: (warning: PlayerWarning) => void;
}

type AttributeApplier = (targets: PlaybackTargets, value: string | null) => void;

type PlaybackAttributeName = (typeof PlaybackAttribute)[keyof typeof PlaybackAttribute];

/**
 * The playback attributes that act the moment they change. The others are read when they matter:
 * `autoplay` and `preload` by the next load, `controls` by the stylesheet. A new playback
 * attribute does not compile until it is given an applier or named here.
 */
type AppliedAttribute = Exclude<
  PlaybackAttributeName,
  | typeof PlaybackAttribute.Autoplay
  | typeof PlaybackAttribute.Preload
  | typeof PlaybackAttribute.Controls
>;

/**
 * An attribute naming one of `choices`: applied when known, warned about otherwise. Removing the
 * attribute leaves the setting as it is.
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
const APPLIERS: Readonly<Record<AppliedAttribute, AttributeApplier>> = {
  [PlaybackAttribute.Stabilization]: choiceApplier(
    PlaybackAttribute.Stabilization,
    STABILIZATION_MODES,
    (player, mode) => {
      player.setStabilization(mode);
    },
  ),
  [PlaybackAttribute.ViewMode]: choiceApplier(
    PlaybackAttribute.ViewMode,
    VIEW_MODES,
    (player, mode) => {
      player.setViewMode(mode);
    },
  ),
  [PlaybackAttribute.Muted]: ({ player }, value): void => {
    player.setMuted(isBooleanAttributeSet(value));
  },
  [PlaybackAttribute.Loop]: ({ player }, value): void => {
    player.setLooping(isBooleanAttributeSet(value));
  },
  [PlaybackAttribute.Poster]: ({ posterImage }, value): void => {
    posterImage.src = value ?? '';
  },
  [PlaybackAttribute.GainMatch]: ({ player }, value): void => {
    player.setGainMatching(shouldMatchGains(value));
  },
};

function isApplied(name: string): name is AppliedAttribute {
  return Object.hasOwn(APPLIERS, name);
}

export function applyPlaybackAttribute(
  targets: PlaybackTargets,
  name: string,
  value: string | null,
): void {
  if (isApplied(name)) APPLIERS[name](targets, value);
}
