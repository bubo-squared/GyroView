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
 * See ADR 0007.
 */
export class MediaSourceAudioClock implements PlaybackClock {
  private constructor(
    private readonly element: HTMLMediaElement,
    private readonly feeder: SourceBufferFeeder,
    private readonly detach: () => void,
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
    const { mediaSource, detach } = await attachMediaSource(element, mediaSourceClass);
    const sourceBuffer = mediaSource.addSourceBuffer(source.mimeType);
    mediaSource.duration = source.duration;
    const feeder = new SourceBufferFeeder({
      element,
      mediaSource,
      sourceBuffer,
      source,
      bufferAhead: options.bufferAhead ?? seconds(DEFAULT_BUFFER_AHEAD_SECONDS),
    });
    feeder.restartFrom(seconds(0));
    return new MediaSourceAudioClock(element, feeder, detach);
  }

  public get currentTime(): Seconds {
    return seconds(this.element.currentTime);
  }

  public get isRunning(): boolean {
    return !this.element.paused && !this.element.ended;
  }

  public get rate(): number {
    return this.element.playbackRate;
  }

  /**
   * The first buffering error, if any. Playback continues with what was buffered before it.
   */
  public get bufferingError(): GyroViewError | undefined {
    return this.feeder.error;
  }

  public async start(): Promise<void> {
    try {
      await this.element.play();
    } catch (error) {
      throw new GyroViewError(
        'playback-blocked',
        'the browser refused to start audio playback; a user gesture is needed',
        { cause: error },
      );
    }
  }

  public stop(): void {
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
    this.detach();
  }
}
