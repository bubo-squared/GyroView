import {
  isBooleanAttributeSet,
  PlaybackAttribute,
  shouldMatchGains,
  stabilizationFromAttribute,
} from './attributes';
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
      const mode = stabilizationFromAttribute(value);
      if (mode) player.setStabilization(mode);
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
