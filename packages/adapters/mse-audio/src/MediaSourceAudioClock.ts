import {
  GyroViewError,
  messageOf,
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

/**
 * PlaybackClock over an audio element fed through Media Source Extensions with the recording's
 * own audio track, so the picture follows the sound and volume and mute are the element's.
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
      });
      feeder.restartFrom(seconds(0));
      return new MediaSourceAudioClock(element, feeder, attached);
    } catch (error) {
      attached.detach();
      throw asClockFailure(error);
    }
  }

  public get currentTime(): Seconds {
    return seconds(this.element.currentTime);
  }

  /**
   * Whoever paused the element (the session, media keys, an audio interruption): `play()` clears
   * `paused` at once, so a start in flight counts as running.
   */
  public get isRunning(): boolean {
    return !this.element.paused;
  }

  public get hasEnded(): boolean {
    return this.element.ended;
  }

  public get failure(): GyroViewError | undefined {
    return this.feeder.failure;
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

  public dispose(): void {
    this.feeder.dispose();
    this.element.pause();
    this.attached.detach();
  }
}

function isNamed(error: unknown, name: string): boolean {
  return error instanceof Error && error.name === name;
}

/**
 * The media source's own exceptions cross the port as typed failures: a type it will not buffer
 * is `codec-unsupported`, anything else `decode`.
 */
function asClockFailure(error: unknown): GyroViewError {
  if (error instanceof GyroViewError) return error;
  const isUnsupported = error instanceof DOMException && error.name === 'NotSupportedError';
  return new GyroViewError(
    isUnsupported ? 'codec-unsupported' : 'decode',
    `the audio element refused the recording's sound: ${messageOf(error)}`,
    { cause: error },
  );
}
