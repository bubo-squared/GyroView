import {
  GyroViewError,
  Signal,
  seconds,
  type AudioSegmentSource,
  type Seconds,
} from '@gyroview/core';

import { nextEvent, nextOfEvents } from './events';

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
const STOPPED = Symbol('stopped');

type Segments = AsyncIterator<Uint8Array<ArrayBuffer>>;

/**
 * Keeps the source buffer filled from the playhead onwards: appends segments while less than
 * `bufferAhead` is buffered past the current time, evicts what lies far behind, and ends the
 * stream when the track ends. A seek restarts it from the new time; disposal stops it.
 */
export class SourceBufferFeeder {
  private stop = new Signal();
  private run: Promise<void> = Promise.resolve();
  private failureValue: GyroViewError | undefined;

  public constructor(private readonly parts: SourceBufferFeederParts) {}

  /**
   * The first error the feeder met, if any. The element keeps whatever was buffered before.
   */
  public get failure(): GyroViewError | undefined {
    return this.failureValue;
  }

  public restartFrom(time: Seconds): void {
    this.stop.trigger();
    const stop = new Signal();
    this.stop = stop;
    this.run = this.feedAfter(this.run, time, stop);
  }

  public dispose(): void {
    this.stop.trigger();
    this.abortPendingAppend();
  }

  /**
   * Runs are serialised so a restart never appends while the previous run is mid-append.
   */
  private async feedAfter(previous: Promise<void>, from: Seconds, stop: Signal): Promise<void> {
    await previous;
    await this.feed(from, stop);
  }

  private async feed(from: Seconds, stop: Signal): Promise<void> {
    const segments = this.parts.source.segmentsFrom(from)[Symbol.asyncIterator]();
    try {
      await this.settlePendingAppend();
      const hasReachedEnd = await this.pump(segments, stop);
      if (hasReachedEnd) this.endStream();
    } catch (error) {
      this.failureValue ??=
        error instanceof GyroViewError
          ? error
          : new GyroViewError('decode', 'feeding the audio buffer failed', { cause: error });
    } finally {
      void segments.return?.();
    }
  }

  /**
   * Appends segments as the playhead needs them. True when the track ended, false when stopped.
   */
  private async pump(segments: Segments, stop: Signal): Promise<boolean> {
    let next = await this.nextWhenNeeded(segments, stop);
    while (next !== STOPPED) {
      if (next.done === true) return true;
      this.evictBehind();
      await this.append(next.value);
      next = await this.nextWhenNeeded(segments, stop);
    }
    return false;
  }

  /**
   * The next segment once the buffer has room for it, or STOPPED if the run ended meanwhile.
   */
  private async nextWhenNeeded(
    segments: Segments,
    stop: Signal,
  ): Promise<IteratorResult<Uint8Array<ArrayBuffer>> | typeof STOPPED> {
    await this.waitUntilNeeded(stop);
    return stop.wasTriggered ? STOPPED : Promise.race([segments.next(), afterStop(stop)]);
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
    await this.settlePendingAppend();
    const outcome = nextOfEvents(sourceBuffer, ['updateend', 'error']);
    try {
      sourceBuffer.appendBuffer(segment);
    } catch (error) {
      throw new GyroViewError('decode', 'the audio buffer rejected a segment', { cause: error });
    }
    if ((await outcome) === 'error') {
      throw new GyroViewError('decode', 'the audio buffer could not parse a segment');
    }
  }

  private async settlePendingAppend(): Promise<void> {
    if (this.parts.sourceBuffer.updating) await nextEvent(this.parts.sourceBuffer, 'updateend');
  }

  private abortPendingAppend(): void {
    const { sourceBuffer, mediaSource } = this.parts;
    if (sourceBuffer.updating && mediaSource.readyState === 'open') sourceBuffer.abort();
  }

  private endStream(): void {
    const { mediaSource, sourceBuffer } = this.parts;
    if (mediaSource.readyState === 'open' && !sourceBuffer.updating) mediaSource.endOfStream();
  }
}

async function afterStop(stop: Signal): Promise<typeof STOPPED> {
  await stop.promise;
  return STOPPED;
}
