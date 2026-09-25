import { seconds, type StabilizationMode } from '@gyroview/core';

import { queryControlParts, type ControlParts } from './controlParts';
import { formatTime } from './formatTime';
import type { Player } from '../player/Player';
import { stabilizationModeOf, viewModeOf } from '../choices';
import { QUALITIES, type Quality } from '../PlayerSource';

/**
 * What the bar asks of the element beyond the player itself.
 */
export interface ControlsHost {
  readonly player: Player;
  toggleFullscreen(): void;
  /**
   * A quality choice means a reload; the element owns that.
   */
  changeQuality(quality: Quality): void;
}

const PLAY_GLYPH = '▶';
const PAUSE_GLYPH = '⏸';
const SOUND_GLYPH = '🔊';
const MUTED_GLYPH = '🔇';

/**
 * Binds the control bar in the shadow tree to the player: transport, seek bar, volume, the
 * settings menu and the fullscreen toggle. Reflects player state back into the widgets.
 */
export class ControlsBar {
  private readonly parts: ControlParts;
  private readonly unsubscribe: (() => void)[] = [];
  private isScrubbing = false;
  private scrubTarget: number | undefined;
  private scrubbing: Promise<void> | undefined;

  public constructor(
    root: ParentNode,
    private readonly host: ControlsHost,
  ) {
    this.parts = queryControlParts(root);
    this.bindTransport();
    this.bindSeek();
    this.bindSound();
    this.bindMenu(root);
    this.bindPlayer();
    this.reflectPlayback();
    this.reflectSound();
  }

  public setQuality(quality: Quality): void {
    this.parts.quality.value = quality;
  }

  public dispose(): void {
    for (const unsubscribe of this.unsubscribe.splice(0)) unsubscribe();
  }

  private get player(): Player {
    return this.host.player;
  }

  private bindTransport(): void {
    const togglePlay = (): void => {
      void this.togglePlay();
    };
    this.parts.play.addEventListener('click', togglePlay);
    this.parts.bigPlay.addEventListener('click', togglePlay);
    this.parts.stop.addEventListener('click', () => {
      this.player.stop();
    });
    this.parts.resetView.addEventListener('click', () => {
      this.player.resetView();
    });
    this.parts.fullscreen.addEventListener('click', () => {
      this.host.toggleFullscreen();
    });
  }

  private bindSeek(): void {
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
        await this.player.scrub(seconds(target));
      }
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
    this.player.seek(seconds(time));
  }

  private bindSound(): void {
    this.parts.mute.addEventListener('click', () => {
      this.player.setMuted(!this.player.isMuted);
    });
    this.parts.volume.addEventListener('input', () => {
      this.player.setVolume(Number(this.parts.volume.value));
      if (this.player.isMuted) this.player.setMuted(false);
    });
  }

  private bindMenu(root: ParentNode): void {
    const { settings, menu, stabilization, viewMode, quality } = this.parts;
    settings.addEventListener('click', () => {
      this.setMenuOpen(menu.hidden);
    });
    root.addEventListener('pointerdown', (event) => {
      const isInside = event.composedPath().some((node) => node === menu || node === settings);
      if (!isInside) this.setMenuOpen(false);
    });
    root.addEventListener('keydown', (event) => {
      if (event instanceof KeyboardEvent && event.key === 'Escape') this.setMenuOpen(false);
    });
    stabilization.addEventListener('change', () => {
      const mode = stabilizationModeOf(stabilization.value);
      if (mode) this.player.setStabilization(mode);
    });
    viewMode.addEventListener('change', () => {
      const mode = viewModeOf(viewMode.value);
      if (mode) this.player.setViewMode(mode);
    });
    quality.addEventListener('change', () => {
      const chosen = QUALITIES.find((candidate) => candidate === quality.value);
      if (chosen) this.host.changeQuality(chosen);
    });
  }

  private bindPlayer(): void {
    const { events } = this.player;
    this.unsubscribe.push(
      events.on('statuschange', () => {
        this.reflectPlayback();
      }),
      events.on('ready', (metadata) => {
        this.parts.seek.max = String(metadata.duration);
        this.parts.qualityRow.hidden = metadata.proxyName === undefined;
        this.reflectPlayback();
      }),
      events.on('timeupdate', (time) => {
        if (this.isScrubbing) return;
        this.parts.seek.value = String(time);
        this.showTime(time);
      }),
      events.on('stabilizationchange', (mode) => {
        this.reflectStabilization(mode);
      }),
      events.on('viewmodechange', (mode) => {
        this.parts.viewMode.value = mode;
      }),
      events.on('volumechange', () => {
        this.reflectSound();
      }),
    );
  }

  private setMenuOpen(isOpen: boolean): void {
    this.parts.menu.hidden = !isOpen;
    this.parts.settings.setAttribute('aria-expanded', String(isOpen));
  }

  private async togglePlay(): Promise<void> {
    if (!this.player.isPaused) {
      this.player.pause();
      return;
    }
    await this.player.play();
  }

  private reflectPlayback(): void {
    const isPlaying = !this.player.isPaused;
    const label = isPlaying ? 'Pause' : 'Play';
    for (const button of [this.parts.play, this.parts.bigPlay]) {
      button.setAttribute('aria-label', label);
    }
    this.parts.play.textContent = isPlaying ? PAUSE_GLYPH : PLAY_GLYPH;
    this.showTime(this.player.currentTime);
    this.reflectStabilization(this.player.stabilization);
    this.parts.viewMode.value = this.player.viewMode;
  }

  private reflectStabilization(mode: StabilizationMode): void {
    this.parts.stabilization.value = mode;
  }

  private reflectSound(): void {
    const { isMuted, volume } = this.player;
    this.parts.mute.textContent = isMuted ? MUTED_GLYPH : SOUND_GLYPH;
    this.parts.mute.setAttribute('aria-pressed', String(isMuted));
    this.parts.mute.setAttribute('aria-label', isMuted ? 'Unmute' : 'Mute');
    this.parts.volume.value = String(isMuted ? 0 : volume);
  }

  private showTime(time: number): void {
    this.parts.time.textContent = `${formatTime(time)} / ${formatTime(this.player.duration)}`;
  }
}
