import { TypedEmitter } from '@gyroview/core';
import { describe, expect, it } from 'vitest';

import type { PlayerEvents, SoundLevel } from './PlayerEvents';
import { PlayerSound } from './PlayerSound';

function soundOver(audio: HTMLAudioElement): { sound: PlayerSound; heard: SoundLevel[] } {
  const events = new TypedEmitter<PlayerEvents>();
  const heard: SoundLevel[] = [];
  events.on('volumechange', (level) => {
    heard.push(level);
  });
  return { sound: new PlayerSound(audio, events), heard };
}

function nextVolumeChange(audio: HTMLAudioElement): Promise<void> {
  return new Promise((resolve) => {
    audio.addEventListener(
      'volumechange',
      () => {
        resolve();
      },
      { once: true },
    );
  });
}

describe('PlayerSound', () => {
  it('clamps the volume to the range the element takes', () => {
    const { sound } = soundOver(document.createElement('audio'));
    sound.setVolume(1.5);
    expect(sound.volume).toBe(1);
    sound.setVolume(-1);
    expect(sound.volume).toBe(0);
  });

  it('announces a change made on the element by anyone, until disposed', async () => {
    const audio = document.createElement('audio');
    const { sound, heard } = soundOver(audio);
    const changed = nextVolumeChange(audio);
    audio.muted = true;
    await changed;
    expect(heard).toEqual([{ volume: 1, isMuted: true }]);
    sound.dispose();
    const changedAgain = nextVolumeChange(audio);
    sound.setMuted(false);
    await changedAgain;
    expect(heard).toHaveLength(1);
  });
});
