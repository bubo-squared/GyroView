import type { EventSink } from '@gyroview/core';

import type { PlayerEvents } from './PlayerEvents';

/**
 * The sound, on the audio element the host lends: its volume and mute, kept across loads by the
 * element itself and announced whoever changes them (the controls, the keyboard, a script, the
 * browser's own media keys).
 */
export class PlayerSound {
  /**
   * Whether the platform lets a page set the volume: iOS keeps media at the device's volume and
   * ignores the setting, where a volume slider would move and change nothing.
   */
  public readonly canSetVolume: boolean;

  public constructor(
    private readonly audio: HTMLMediaElement,
    private readonly events: EventSink<PlayerEvents>,
  ) {
    this.canSetVolume = isVolumeSettable(audio.ownerDocument);
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

/**
 * A volume the probe sets, other than the default of 1.
 */
const PROBE_VOLUME = 0.5;

/**
 * Tried on an element of its own, so the one playing hears no volume change.
 */
function isVolumeSettable(document: Document): boolean {
  const probe = document.createElement('audio');
  probe.volume = PROBE_VOLUME;
  return probe.volume === PROBE_VOLUME;
}
