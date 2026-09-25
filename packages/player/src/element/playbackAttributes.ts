import { PlaybackAttribute } from './attributeNames';
import { isBooleanAttributeSet, shouldMatchGains } from './attributes';
import { stabilizationModeOf, viewModeOf } from '../choices';
import type { Player } from '../player/Player';

export interface PlaybackTargets {
  readonly player: Player;
  readonly posterImage: HTMLImageElement;
}

type AttributeApplier = (targets: PlaybackTargets, value: string | null) => void;

/**
 * What each attribute that changes playback without reloading does.
 */
const APPLIERS: ReadonlyMap<string, AttributeApplier> = new Map<string, AttributeApplier>([
  [
    PlaybackAttribute.Stabilization,
    ({ player }, value): void => {
      const mode = stabilizationModeOf(value);
      if (mode) player.setStabilization(mode);
    },
  ],
  [
    PlaybackAttribute.ViewMode,
    ({ player }, value): void => {
      const mode = viewModeOf(value);
      if (mode) player.setViewMode(mode);
    },
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
