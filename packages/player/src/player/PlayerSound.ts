import type { TypedEmitter } from '@gyroview/core';

import type { PlayerEvents } from './PlayerEvents';

/**
 * The sound, on the audio element the host lends: its volume and mute, kept across loads by the
 * element itself and announced whoever changes them (the controls, the keyboard, a script, the
 * browser's own media keys).
 */
export class PlayerSound {
  public constructor(
    private readonly audio: HTMLMediaElement,
    private readonly events: TypedEmitter<PlayerEvents>,
  ) {
    audio.addEventListener('volumechange', this.onVolumeChange);
  }

  public get volume(): number {
    return this.audio.volume;
  }

  public get isMuted(): boolean {
    return this.audio.muted;
  }

  /**
   * From 0 (silent) to 1 (as recorded); anything outside is clamped.
   */
  public setVolume(volume: number): void {
    this.audio.volume = Math.min(Math.max(volume, 0), 1);
  }

  public setMuted(isMuted: boolean): void {
    this.audio.muted = isMuted;
  }

  public dispose(): void {
    this.audio.removeEventListener('volumechange', this.onVolumeChange);
  }

  private readonly onVolumeChange = (): void => {
    this.events.emit('volumechange', { volume: this.volume, isMuted: this.isMuted });
  };
}
