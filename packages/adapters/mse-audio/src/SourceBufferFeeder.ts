import {
  GyroViewError,
  Signal,
  seconds,
  type AudioSegmentSource,
  type Seconds,
} from '@gyroview/core';

import { nextEvent, nextOfEvents } from './mediaSourceSupport';

export interface SourceBufferFeederParts {
  readonly element: HTMLMediaElement;
  readonly mediaSource: MediaSource;
  readonly sourceBuffer: SourceBuffer;
  readonly source: AudioSegmentSource;
  /**
   * How far past the playhead the buffer is kept filled.
   */
  readonly bufferAhead: Seconds;
}

/**
 * Buffered audio kept behind the playhead for small backward seeks; older data is evicted.
 */
const KEEP_BEHIND_SECONDS = 30;
/**
 * Eviction runs once this much audio has piled up behind the playhead.
 */
const EVICT_BEHIND_SECONDS = 60;
/**
 * Events on which the feeder re-checks whether the buffer needs more data.
 */
const WAKE_EVENTS = ['timeupdate', 'seeking', 'waiting', 'play'] as const;

/**
 * Keeps the source buffer filled from the playhead onwards: appends segments while less than
 * `bufferAhead` is buffered past the current time, evicts what lies far behind, and ends the
 * stream when the track ends. A seek restarts it from the new time.
 */
export class SourceBufferFeeder {
  private stop = new Signal();
  private run: Promise<void> = Promise.resolve();
  private failure: GyroViewError | undefined;

  public constructor(private readonly parts: SourceBufferFeederParts) {}

  /**
   * The first error the feeder met, if any; the media element itself keeps playing what it has.
   */
  public get error(): GyroViewError | undefined {
    return this.failure;
  }

  public restartFrom(time: Seconds): void {
    this.stop.trigger();
    const stop = new Signal();
    this.stop = stop;
    this.run = this.feedAfter(this.run, time, stop);
  }

  public dispose(): void {
    this.stop.trigger();
  }

  /**
   * Runs are serialised so a restart never appends while the previous run is mid-append.
   */
  private async feedAfter(previous: Promise<void>, from: Seconds, stop: Signal): Promise<void> {
    await previous;
    await this.feed(from, stop);
  }

  private async feed(from: Seconds, stop: Signal): Promise<void> {
    try {
      await this.abortPendingAppend();
      for await (const segment of this.parts.source.segmentsFrom(from)) {
        await this.waitUntilNeeded(stop);
        if (stop.wasTriggered) return;
        this.evictBehind();
        await this.append(segment);
      }
      if (!stop.wasTriggered) this.endStream();
    } catch (error) {
      this.failure ??=
        error instanceof GyroViewError
          ? error
          : new GyroViewError('decode', 'feeding the audio buffer failed', { cause: error });
    }
  }

  private async waitUntilNeeded(stop: Signal): Promise<void> {
    while (!stop.wasTriggered && this.bufferedAhead() >= this.parts.bufferAhead) {
      await Promise.race([nextOfEvents(this.parts.element, WAKE_EVENTS), stop.promise]);
    }
  }

  /**
   * Seconds buffered from the playhead to the end of the range it lies in; zero outside any.
   */
  private bufferedAhead(): Seconds {
    const { buffered, currentTime } = this.parts.element;
    for (let index = 0; index < buffered.length; index += 1) {
      if (buffered.start(index) <= currentTime && currentTime < buffered.end(index)) {
        return seconds(buffered.end(index) - currentTime);
      }
    }
    return seconds(0);
  }

  private evictBehind(): void {
    const { buffered, currentTime } = this.parts.element;
    const oldest = buffered.length > 0 ? buffered.start(0) : currentTime;
    if (currentTime - oldest < EVICT_BEHIND_SECONDS || this.parts.sourceBuffer.updating) return;
    this.parts.sourceBuffer.remove(0, currentTime - KEEP_BEHIND_SECONDS);
  }

  private async append(segment: Uint8Array<ArrayBuffer>): Promise<void> {
    const { sourceBuffer } = this.parts;
    if (sourceBuffer.updating) await nextEvent(sourceBuffer, 'updateend');
    const finished = nextOfEvents(sourceBuffer, ['updateend', 'error']);
    try {
      sourceBuffer.appendBuffer(segment);
    } catch (error) {
      throw new GyroViewError('decode', 'the audio buffer rejected a segment', { cause: error });
    }
    await finished;
  }

  private async abortPendingAppend(): Promise<void> {
    const { sourceBuffer, mediaSource } = this.parts;
    if (!sourceBuffer.updating) return;
    const settled = nextEvent(sourceBuffer, 'updateend');
    if (mediaSource.readyState === 'open') sourceBuffer.abort();
    await settled;
  }

  private endStream(): void {
    const { mediaSource, sourceBuffer } = this.parts;
    if (mediaSource.readyState === 'open' && !sourceBuffer.updating) mediaSource.endOfStream();
  }
}
