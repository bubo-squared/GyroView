import type { ControlParts } from './controlParts';
import { ICONS } from './icons';
import type { Player } from '../player/Player';

export type SoundParts = Pick<ControlParts, 'mute' | 'volume'>;

/**
 * The sound the controls show and change.
 */
export type SoundPlayer = Pick<Player, 'events' | 'volume' | 'isMuted' | 'setVolume' | 'setMuted'>;

/**
 * The mute button and the volume slider, showing the sound however it was last changed. The
 * button is a toggle named "Mute": pressed means muted, as assistive technology expects.
 */
export class SoundControls {
  public constructor(
    private readonly parts: SoundParts,
    private readonly player: SoundPlayer,
  ) {
    parts.mute.addEventListener('click', () => {
      player.setMuted(!player.isMuted);
    });
    parts.volume.addEventListener('input', () => {
      player.setVolume(Number(parts.volume.value));
      if (player.isMuted) player.setMuted(false);
    });
    player.events.on('volumechange', () => {
      this.reflect();
    });
    this.reflect();
  }

  private reflect(): void {
    const { isMuted, volume } = this.player;
    this.parts.mute.innerHTML = isMuted ? ICONS.muted : ICONS.sound;
    this.parts.mute.setAttribute('aria-pressed', String(isMuted));
    this.parts.volume.value = String(isMuted ? 0 : volume);
  }
}
