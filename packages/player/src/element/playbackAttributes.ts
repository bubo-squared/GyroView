import { isBooleanAttributeSet, PlaybackAttribute, stabilizationFromAttribute } from './attributes';
import type { Player } from '../player/Player';

export interface PlaybackTargets {
  readonly player: Player;
  readonly posterImage: HTMLImageElement;
}

/**
 * Applies one of the attributes that change playback without reloading.
 */
export function applyPlaybackAttribute(
  targets: PlaybackTargets,
  name: string,
  value: string | null,
): void {
  const { player, posterImage } = targets;
  switch (name) {
    case PlaybackAttribute.Stabilization: {
      const mode = stabilizationFromAttribute(value);
      if (mode) player.setStabilization(mode);
      break;
    }
    case PlaybackAttribute.Muted: {
      player.setMuted(isBooleanAttributeSet(value));
      break;
    }
    case PlaybackAttribute.Loop: {
      player.setLooping(isBooleanAttributeSet(value));
      break;
    }
    case PlaybackAttribute.Poster: {
      posterImage.src = value ?? '';
      break;
    }
    default: {
      break;
    }
  }
}
