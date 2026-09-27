import { messageOf } from '@gyroview/core';

import type { ControlParts } from './controlParts';
import type { ControlsHost } from './ControlsHost';
import { formatTime } from './formatTime';
import { SEEK_STEP_SECONDS } from './keyboard';
import type { Player } from '../player/Player';

export type SeekParts = Pick<ControlParts, 'seek' | 'time'>;

/**
 * The slider's arrow keys and the direction each seeks in: the native step is the one the
 * thumb is dragged in, a hundredth of a second, too fine for a key.
 */
const ARROW_DIRECTIONS: ReadonlyMap<string, number> = new Map([
  ['ArrowLeft', -1],
  ['ArrowDown', -1],
  ['ArrowRight', 1],
  ['ArrowUp', 1],
]);

/**
 * The events that end a drag of the thumb. A drag released where it began commits no `change`,
 * so the release ends it too, whichever comes first.
 */
const SCRUB_ENDINGS = ['pointerup', 'pointercancel', 'change'] as const;

/**
 * What the seek bar follows and moves.
 */
export type SeekPlayer = Pick<Player, 'events' | 'currentTime' | 'duration' | 'seek' | 'scrub'>;

/**
 * The player, and where the seek bar reports a failed scrub.
 */
export interface SeekHost extends Pick<ControlsHost, 'warn'> {
  readonly player: SeekPlayer;
}

/**
 * The seek bar and the time beside it: dragging scrubs to key frames, releasing seeks exactly,
 * and the bar follows playback while it is not held. Its range is the recording's duration,
 * read on every status change, so a failed or unloaded recording leaves an empty bar.
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
    events.on('statuschange', () => {
      this.showRecording();
    });
    events.on('timeupdate', (time) => {
      this.follow(time);
    });
    this.showRecording();
  }

  private bindInput(): void {
    const { seek } = this.parts;
    seek.addEventListener('input', () => {
      this.isScrubbing = true;
      const time = Number(seek.value);
      this.showTime(time);
      this.scrubTo(time);
    });
    for (const ending of SCRUB_ENDINGS) {
      seek.addEventListener(ending, () => {
        this.endScrub();
      });
    }
    seek.addEventListener('keydown', (event) => {
      const direction = ARROW_DIRECTIONS.get(event.key);
      if (direction === undefined) return;
      event.preventDefault();
      const { player } = this.host;
      player.seek(player.currentTime + direction * SEEK_STEP_SECONDS);
    });
  }

  private showRecording(): void {
    const { duration, currentTime } = this.host.player;
    this.parts.seek.max = String(duration);
    this.follow(currentTime);
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
        await this.host.player.scrub(target);
      }
    } catch (error) {
      this.host.warn(`the seek bar could not show that moment: ${messageOf(error)}`);
    } finally {
      this.scrubbing = undefined;
    }
  }

  /**
   * Seeks exactly where the thumb was let go; a scrub still in flight yields to the seek (the
   * session drops a scrub a seek overtook).
   */
  private endScrub(): void {
    if (!this.isScrubbing) return;
    this.isScrubbing = false;
    this.scrubTarget = undefined;
    this.host.player.seek(Number(this.parts.seek.value));
  }

  /**
   * The time beside the bar, and the same time for screen readers, which would read the slider's
   * raw seconds.
   */
  private showTime(time: number): void {
    const [shown, total] = [formatTime(time), formatTime(this.host.player.duration)];
    this.parts.time.textContent = `${shown} / ${total}`;
    this.parts.seek.setAttribute('aria-valuetext', `${shown} of ${total}`);
  }
}
