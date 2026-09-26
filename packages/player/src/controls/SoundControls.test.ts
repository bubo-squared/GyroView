import { TypedEmitter } from '@gyroview/core';
import { describe, expect, it } from 'vitest';

import { SoundControls, type SoundParts, type SoundPlayer } from './SoundControls';
import type { PlayerEvents } from '../player/PlayerEvents';
import { expectIconOnly } from '../test/controls';

/**
 * The sound as a player keeps it, announcing every change as the real one does.
 */
class FakeSound implements SoundPlayer {
  public readonly events = new TypedEmitter<PlayerEvents>();
  public volume = 1;
  public isMuted = false;

  public setVolume(volume: number): void {
    this.volume = volume;
    this.announce();
  }

  public setMuted(isMuted: boolean): void {
    this.isMuted = isMuted;
    this.announce();
  }

  private announce(): void {
    this.events.emit('volumechange', { volume: this.volume, isMuted: this.isMuted });
  }
}

function soundControls(): { parts: SoundParts; sound: FakeSound } {
  const volume = document.createElement('input');
  volume.type = 'range';
  volume.max = '1';
  volume.step = 'any';
  const mute = document.createElement('button');
  mute.setAttribute('aria-label', 'Mute');
  const parts = { mute, volume };
  const sound = new FakeSound();
  new SoundControls(parts, sound);
  return { parts, sound };
}

describe('SoundControls', () => {
  it('mutes and unmutes on the button, a toggle that keeps its name', () => {
    const { parts, sound } = soundControls();
    expect(parts.mute.getAttribute('aria-label')).toBe('Mute');
    expectIconOnly(parts.mute);
    const soundIcon = parts.mute.getHTML();
    parts.mute.click();
    expect(sound.isMuted).toBe(true);
    expect(parts.mute.getAttribute('aria-pressed')).toBe('true');
    expect(parts.mute.getAttribute('aria-label')).toBe('Mute');
    expectIconOnly(parts.mute);
    expect(parts.mute.getHTML()).not.toBe(soundIcon);
    expect(parts.volume.value).toBe('0');
    expect(parts.volume.getAttribute('aria-valuetext')).toBe('0%');
  });

  it('sets the volume from the slider and unmutes, as a media player does', () => {
    const { parts, sound } = soundControls();
    sound.setMuted(true);
    parts.volume.value = '0.25';
    parts.volume.dispatchEvent(new Event('input'));
    expect(sound.volume).toBe(0.25);
    expect(sound.isMuted).toBe(false);
  });

  it('shows a change made elsewhere', () => {
    const { parts, sound } = soundControls();
    sound.setVolume(0.5);
    expect(parts.volume.value).toBe('0.5');
    expect(parts.volume.getAttribute('aria-valuetext')).toBe('50%');
  });
});
