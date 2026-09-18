import {
  GyroViewError,
  seconds,
  type AudioSegmentSource,
  type PlaybackClock,
  type Seconds,
} from '@gyroview/core';

import {
  attachMediaSource,
  isMediaSourceTypeSupported,
  mediaSourceConstructor,
  type AttachedMediaSource,
} from './mediaSourceSupport';
import { SourceBufferFeeder } from './SourceBufferFeeder';

export interface MediaSourceAudioClockOptions {
  /**
   * How far past the playhead audio is kept buffered. Default 30 s.
   */
  readonly bufferAhead?: Seconds;
}

const DEFAULT_BUFFER_AHEAD_SECONDS = 30;

/**
 * PlaybackClock over an audio element fed through Media Source Extensions with the recording's
 * own audio track, so the picture follows the sound and volume, mute and rate are the element's.
 * The element is borrowed from the host; disposing detaches the media source from it.
 * See ADR 0007.
 */
export class MediaSourceAudioClock implements PlaybackClock {
  private constructor(
    private readonly element: HTMLMediaElement,
    private readonly feeder: SourceBufferFeeder,
    private readonly attached: AttachedMediaSource,
  ) {}

  public static isSupported(source: Pick<AudioSegmentSource, 'mimeType'>): boolean {
    return isMediaSourceTypeSupported(source.mimeType);
  }

  /**
   * Attaches a media source to the element and starts buffering from the beginning.
   */
  public static async open(
    element: HTMLMediaElement,
    source: AudioSegmentSource,
    options: MediaSourceAudioClockOptions = {},
  ): Promise<MediaSourceAudioClock> {
    const mediaSourceClass = mediaSourceConstructor();
    if (!mediaSourceClass?.isTypeSupported(source.mimeType)) {
      throw new GyroViewError(
        'codec-unsupported',
        `${source.mimeType} cannot play through Media Source Extensions here`,
      );
    }
    const attached = await attachMediaSource(element, mediaSourceClass);
    try {
      const sourceBuffer = attached.mediaSource.addSourceBuffer(source.mimeType);
      attached.mediaSource.duration = source.duration;
      const feeder = new SourceBufferFeeder({
        element,
        mediaSource: attached.mediaSource,
        sourceBuffer,
        source,
        bufferAhead: options.bufferAhead ?? seconds(DEFAULT_BUFFER_AHEAD_SECONDS),
      });
      feeder.restartFrom(seconds(0));
      return new MediaSourceAudioClock(element, feeder, attached);
    } catch (error) {
      attached.detach();
      throw error;
    }
  }

  public get currentTime(): Seconds {
    return seconds(this.element.currentTime);
  }

  public get isRunning(): boolean {
    return !this.element.paused && !this.element.ended;
  }

  public get hasEnded(): boolean {
    return this.element.ended;
  }

  public get failure(): GyroViewError | undefined {
    return this.feeder.failure;
  }

  public get rate(): number {
    return this.element.playbackRate;
  }

  /**
   * Resolves once playback has started. A `pause` that interrupts the start is not an error;
   * the autoplay policy refusing to start is reported as `playback-blocked`.
   */
  public async start(): Promise<void> {
    try {
      await this.element.play();
    } catch (error) {
      if (isNamed(error, 'AbortError')) return;
      const isBlocked = isNamed(error, 'NotAllowedError');
      throw new GyroViewError(
        isBlocked ? 'playback-blocked' : 'decode',
        isBlocked
          ? 'the browser refused to start audio playback; a user gesture is needed'
          : 'audio playback failed to start',
        { cause: error },
      );
    }
  }

  public pause(): void {
    this.element.pause();
  }

  public seek(time: Seconds): void {
    this.element.currentTime = time;
    this.feeder.restartFrom(time);
  }

  public setRate(rate: number): void {
    this.element.playbackRate = rate;
  }

  public dispose(): void {
    this.feeder.dispose();
    this.element.pause();
    this.attached.detach();
  }
}

function isNamed(error: unknown, name: string): boolean {
  return error instanceof Error && error.name === name;
}
