import { messageOf, seconds } from '@gyroview/core';

import type { ControlParts } from './controlParts';
import type { ControlsHost } from './ControlsHost';
import { formatTime } from './formatTime';
import type { Player } from '../player/Player';

type SeekParts = Pick<ControlParts, 'seek' | 'time'>;

/**
 * What the seek bar follows and moves, and where it reports a failed scrub.
 */
interface SeekHost extends Pick<ControlsHost, 'warn'> {
  readonly player: Pick<Player, 'events' | 'currentTime' | 'duration' | 'seek' | 'scrub'>;
}

/**
 * The seek bar and the time beside it: dragging scrubs to key frames, releasing seeks exactly,
 * and the bar follows playback while it is not held.
 */
export class SeekBar {
  private isScrubbing = false;
  private scrubTarget: number | undefined;
  private scrubbing: Promise<void> | undefined;

  public constructor(
    private readonly parts: SeekParts,
    private readonly host: SeekHost,
  ) {
    this.bindInput();
    const { events } = this.host.player;
    events.on('ready', (metadata) => {
      parts.seek.max = String(metadata.duration);
      this.showTime(this.host.player.currentTime);
    });
    events.on('statuschange', () => {
      this.showTime(this.host.player.currentTime);
    });
    events.on('timeupdate', (time) => {
      this.follow(time);
    });
    this.showTime(this.host.player.currentTime);
  }

  private bindInput(): void {
    const { seek } = this.parts;
    seek.addEventListener('input', () => {
      this.isScrubbing = true;
      const time = Number(seek.value);
      this.showTime(time);
      this.scrubTo(time);
    });
    seek.addEventListener('change', () => {
      this.isScrubbing = false;
      void this.seekExactly(Number(seek.value));
    });
  }

  private follow(time: number): void {
    if (this.isScrubbing) return;
    this.parts.seek.value = String(time);
    this.showTime(time);
  }

  /**
   * One scrub in flight at a time; a newer target replaces one still waiting, so the picture
   * follows the thumb without queueing every position it passed.
   */
  private scrubTo(time: number): void {
    this.scrubTarget = time;
    this.scrubbing ??= this.drainScrubs();
  }

  private async drainScrubs(): Promise<void> {
    try {
      while (this.scrubTarget !== undefined) {
        const target = this.scrubTarget;
        this.scrubTarget = undefined;
        await this.host.player.scrub(seconds(target));
      }
    } catch (error) {
      this.host.warn(`the seek bar could not show that moment: ${messageOf(error)}`);
    } finally {
      this.scrubbing = undefined;
    }
  }

  /**
   * The exact seek waits for a scrub still in flight, which would otherwise land after it.
   */
  private async seekExactly(time: number): Promise<void> {
    this.scrubTarget = undefined;
    await this.scrubbing;
    this.host.player.seek(seconds(time));
  }

  private showTime(time: number): void {
    this.parts.time.textContent = `${formatTime(time)} / ${formatTime(this.host.player.duration)}`;
  }
}
