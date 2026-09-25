import type { ControlParts } from './controlParts';
import type { Player } from '../player/Player';

const SOUND_GLYPH = '🔊';
const MUTED_GLYPH = '🔇';

export type SoundParts = Pick<ControlParts, 'mute' | 'volume'>;

/**
 * The mute button and the volume slider, showing the sound however it was last changed.
 */
export class SoundControls {
  public constructor(
    private readonly parts: SoundParts,
    private readonly player: Player,
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
    this.parts.mute.textContent = isMuted ? MUTED_GLYPH : SOUND_GLYPH;
    this.parts.mute.setAttribute('aria-pressed', String(isMuted));
    this.parts.mute.setAttribute('aria-label', isMuted ? 'Unmute' : 'Mute');
    this.parts.volume.value = String(isMuted ? 0 : volume);
  }
}
