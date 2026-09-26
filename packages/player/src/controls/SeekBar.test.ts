import { Deferred, seconds, TypedEmitter, type Seconds } from '@gyroview/core';
import { describe, expect, it } from 'vitest';

import { SeekBar, type SeekParts, type SeekPlayer } from './SeekBar';
import type { PlayerEvents } from '../player/PlayerEvents';
import { settle } from '../test/waiting';

/**
 * The transport as a player keeps it; each scrub waits until the test lets it land.
 */
class FakeTransport implements SeekPlayer {
  public readonly events = new TypedEmitter<PlayerEvents>();
  public currentTime = seconds(0);
  public duration = seconds(0);
  public readonly seeks: number[] = [];
  public readonly scrubs: number[] = [];
  private landing = new Deferred<void>();

  public seek(time: Seconds): void {
    this.seeks.push(time);
  }

  public scrub(time: Seconds): Promise<void> {
    this.scrubs.push(time);
    return this.landing.promise;
  }

  public landScrub(failure?: Error): void {
    if (failure) this.landing.reject(failure);
    else this.landing.resolve();
    this.landing = new Deferred<void>();
  }

  public becomeReady(duration: number): void {
    this.duration = seconds(duration);
    this.events.emit('statuschange', 'ready');
  }
}

interface World {
  readonly parts: SeekParts;
  readonly transport: FakeTransport;
  readonly warnings: string[];
  readonly drag: (time: number) => void;
  readonly release: (time: number) => void;
}

function seekBar(): World {
  const seek = document.createElement('input');
  seek.type = 'range';
  seek.step = 'any';
  const parts = { seek, time: document.createElement('span') };
  const transport = new FakeTransport();
  const warnings: string[] = [];
  new SeekBar(parts, {
    player: transport,
    warn: (message): void => {
      warnings.push(message);
    },
  });
  return {
    parts,
    transport,
    warnings,
    drag: (time): void => {
      seek.value = String(time);
      seek.dispatchEvent(new Event('input'));
    },
    release: (time): void => {
      seek.value = String(time);
      seek.dispatchEvent(new Event('change'));
    },
  };
}

describe('SeekBar', () => {
  it('spans the loaded recording, and nothing once a load fails or it is unloaded', () => {
    const { parts, transport } = seekBar();
    transport.becomeReady(3);
    expect(parts.seek.max).toBe('3');
    expect(parts.time.textContent).toBe('0:00 / 0:03');
    transport.duration = seconds(0);
    transport.events.emit('statuschange', 'error');
    expect(parts.seek.max).toBe('0');
    expect(parts.time.textContent).toBe('0:00 / 0:00');
  });

  it('follows playback while not held, and stays with the thumb while it is dragged', () => {
    const { parts, transport, drag } = seekBar();
    transport.becomeReady(10);
    transport.events.emit('timeupdate', seconds(1));
    expect(parts.seek.value).toBe('1');
    drag(4);
    transport.events.emit('timeupdate', seconds(2));
    expect(parts.seek.value).toBe('4');
    expect(parts.time.textContent).toBe('0:04 / 0:10');
  });

  it('scrubs one position at a time, the latest one a drag passed', async () => {
    const { transport, drag } = seekBar();
    transport.becomeReady(10);
    drag(1);
    drag(2);
    drag(3);
    expect(transport.scrubs).toEqual([1]);
    transport.landScrub();
    await settle();
    expect(transport.scrubs).toEqual([1, 3]);
  });

  it('seeks exactly on release, once the scrub in flight has landed', async () => {
    const { transport, drag, release } = seekBar();
    transport.becomeReady(10);
    drag(1);
    release(2);
    await settle();
    expect(transport.seeks).toEqual([]);
    transport.landScrub();
    await settle();
    expect(transport.seeks).toEqual([2]);
    expect(transport.scrubs).toEqual([1]);
  });

  it('warns when a scrub fails', async () => {
    const { transport, drag, warnings } = seekBar();
    transport.becomeReady(10);
    drag(1);
    transport.landScrub(new Error('no key frame there'));
    await settle();
    expect(warnings).toEqual(['the seek bar could not show that moment: no key frame there']);
  });
});
