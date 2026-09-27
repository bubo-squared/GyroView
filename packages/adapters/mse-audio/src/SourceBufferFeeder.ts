import {
  GyroViewError,
  RunStop,
  seconds,
  STOPPED,
  type AudioSegmentSource,
  type Seconds,
} from '@gyroview/core';

import { nextOfEvents } from './events';

interface SourceBufferFeederParts {
  readonly element: HTMLMediaElement;
  readonly mediaSource: MediaSource;
  readonly sourceBuffer: SourceBuffer;
  readonly source: AudioSegmentSource;
}

/**
 * How far past the playhead audio is kept buffered, to ride out a slow network.
 */
const BUFFER_AHEAD_SECONDS = 30;
/**
 * Buffered audio kept behind the playhead for small backward seeks; older data is evicted.
 */
const KEEP_BEHIND_SECONDS = 30;
/**
 * Eviction runs once this much audio has piled up behind the playhead.
 */
const EVICT_BEHIND_SECONDS = 60;
/**
 * How far before its time a run starts feeding. The decoder gets the frames before the playhead
 * (each AAC frame overlaps the one before), and a seek to the very end appends more than the lone
 * last frame, of which WebKit on Linux buffers nothing, failing the element once the stream ends.
 */
const LEAD_IN_SECONDS = 1;
/**
 * Events on which the feeder re-checks whether the buffer needs more data.
 */
const WAKE_EVENTS = ['timeupdate', 'seeking', 'waiting', 'play'] as const;

type Segments = AsyncIterator<Uint8Array<ArrayBuffer>>;

/**
 * Keeps the source buffer filled from the playhead onwards: appends segments while less than
 * `BUFFER_AHEAD_SECONDS` of audio is buffered past the current time, evicts what lies far behind,
 * and ends the stream when the track ends. A seek restarts it from what the new time is missing;
 * disposal stops it.
 */
export class SourceBufferFeeder {
  private stop = new RunStop();
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
    this.stop.stop();
    const stop = new RunStop();
    this.stop = stop;
    this.run = this.feedAfter(this.run, time, stop);
  }

  /**
   * Stops feeding. An append or eviction under way is left to the media source's detachment,
   * which ends it; `abort` would throw while old audio is being evicted.
   */
  public dispose(): void {
    this.stop.stop();
  }

  /**
   * Runs are serialised so a restart never appends while the previous run is mid-append.
   */
  private async feedAfter(previous: Promise<void>, from: Seconds, stop: RunStop): Promise<void> {
    await previous;
    await this.feed(from, stop);
  }

  private async feed(from: Seconds, stop: RunStop): Promise<void> {
    try {
      await this.settlePendingAppend();
      await this.feedFrom(this.startOf(from), stop);
    } catch (error) {
      this.failureValue ??=
        error instanceof GyroViewError
          ? error
          : new GyroViewError('decode', 'feeding the audio buffer failed', { cause: error });
    }
  }

  private async feedFrom(start: Seconds, stop: RunStop): Promise<void> {
    const segments = this.parts.source.segmentsFrom(start)[Symbol.asyncIterator]();
    try {
      const hasReachedEnd = await this.pump(segments, stop);
      if (hasReachedEnd) this.endStream();
    } finally {
      void segments.return?.();
    }
  }

  /**
   * Where a run for `from` starts: at the end of the audio already buffered around it, so a seek
   * within the buffer appends only what is missing, or a lead-in before it otherwise.
   */
  private startOf(from: Seconds): Seconds {
    const bufferedEnd = this.bufferedEndAt(from);
    return seconds(bufferedEnd > from ? bufferedEnd : Math.max(0, from - LEAD_IN_SECONDS));
  }

  /**
   * Appends segments as the playhead needs them. True when the track ended, false when stopped.
   */
  private async pump(segments: Segments, stop: RunStop): Promise<boolean> {
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
    stop: RunStop,
  ): Promise<IteratorResult<Uint8Array<ArrayBuffer>> | typeof STOPPED> {
    await this.waitUntilNeeded(stop);
    return stop.race(() => segments.next());
  }

  private async waitUntilNeeded(stop: RunStop): Promise<void> {
    while (!stop.wasStopped && this.bufferedAhead() >= BUFFER_AHEAD_SECONDS) {
      const woken = new AbortController();
      await stop.race(() => nextOfEvents(this.parts.element, WAKE_EVENTS, woken.signal));
      woken.abort();
    }
  }

  /**
   * Seconds buffered from the playhead to the end of the range it lies in; zero outside any.
   */
  private bufferedAhead(): Seconds {
    const { currentTime } = this.parts.element;
    return seconds(this.bufferedEndAt(currentTime) - currentTime);
  }

  /**
   * The end of the buffered range `time` lies in; `time` itself outside any.
   */
  private bufferedEndAt(time: number): number {
    const { buffered } = this.parts.element;
    for (let index = 0; index < buffered.length; index += 1) {
      if (buffered.start(index) <= time && time < buffered.end(index)) return buffered.end(index);
    }
    return time;
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
    if (this.parts.sourceBuffer.updating)
      await nextOfEvents(this.parts.sourceBuffer, ['updateend']);
  }

  private endStream(): void {
    const { mediaSource, sourceBuffer } = this.parts;
    if (mediaSource.readyState === 'open' && !sourceBuffer.updating) mediaSource.endOfStream();
  }
}
