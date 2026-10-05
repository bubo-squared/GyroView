import {
  asGyroViewError,
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
 * How far before its time a run starts feeding: each AAC frame overlaps the one before, so the
 * decoder gets the frames that lead up to the playhead.
 */
const LEAD_IN_SECONDS = 1;
/**
 * How close to the end of a buffered range a waiting playhead counts as at that end, where the
 * run appends next: a few AAC frames of 1024 samples.
 */
const RANGE_END_SECONDS = 0.1;
/**
 * Events on which the feeder re-checks whether the buffer needs more data.
 */
const WAKE_EVENTS = ['timeupdate', 'seeking', 'waiting', 'play'] as const;

type Segments = AsyncIterator<Uint8Array<ArrayBuffer>>;

/**
 * Keeps the source buffer filled from the playhead onwards: appends segments while less than
 * `BUFFER_AHEAD_SECONDS` of audio is buffered past the current time, evicts what lies far behind,
 * and ends the stream when the track ends. A seek restarts it from what the new time is missing;
 * so does an element waiting at a playhead whose audio went missing after it was appended;
 * disposal stops it.
 */
export class SourceBufferFeeder {
  private stop = new RunStop();
  private run: Promise<void> = Promise.resolve();
  private failureValue: GyroViewError | undefined;
  /**
   * Where the latest run was asked to start.
   */
  private restartedFrom: Seconds | undefined;
  private readonly listening = new AbortController();

  public constructor(private readonly parts: SourceBufferFeederParts) {
    parts.element.addEventListener(
      'waiting',
      () => {
        this.feedThePlayheadIfLost();
      },
      { signal: this.listening.signal },
    );
  }

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
    this.restartedFrom = time;
    this.run = this.feedAfter(this.run, time, stop);
  }

  /**
   * Stops feeding. An append or eviction under way is left to the media source's detachment,
   * which ends it; `abort` would throw while old audio is being evicted.
   */
  public dispose(): void {
    this.stop.stop();
    this.listening.abort();
  }

  /**
   * The element waits in a hole at the playhead, not at the end of what a run appends: the engine
   * evicted the audio there after it was appended, as a managed media source may at any time. A
   * run appending further on, or one that ended the stream, never comes back for it, and the
   * clock would stand still with the sound. Asked for once per playhead, as a seek to it is.
   */
  private feedThePlayheadIfLost(): void {
    const { element } = this.parts;
    const playhead = seconds(element.currentTime);
    const isInHole = !this.isBufferedAt(playhead) && !this.endsRangeAt(playhead);
    const canPlay = !element.ended && !this.hasElementFailed();
    if (isInHole && canPlay && playhead !== this.restartedFrom) this.restartFrom(playhead);
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
      if (stop.wasStopped || this.hasElementFailed() || this.hasAllAudioFrom(from)) return;
      await this.feedFrom(this.startOf(from), stop);
    } catch (error) {
      this.failureValue ??= asGyroViewError(error, 'decode', 'feeding the audio buffer failed');
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
   * The stream ended and `from` lies in the range that runs to its end: nothing is left to
   * append, and a run would only append the last frame again and reopen the stream.
   */
  private hasAllAudioFrom(from: Seconds): boolean {
    const { buffered } = this.parts.element;
    const end = this.bufferedEndAt(from);
    const isEnded = this.parts.mediaSource.readyState === 'ended';
    return isEnded && end > from && end === buffered.end(buffered.length - 1);
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
   * A run stops only between two whole segments (the port's promise) and never cancels an
   * append, so the source buffer's parser is always at a segment's start when the next run
   * appends its initialization segment.
   */
  private async pump(segments: Segments, stop: RunStop): Promise<boolean> {
    let next = await this.nextWhenNeeded(segments, stop);
    while (next !== STOPPED) {
      if (next.done === true) return true;
      if (this.hasElementFailed()) return false;
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

  private isBufferedAt(time: number): boolean {
    return this.bufferedEndAt(time) > time;
  }

  /**
   * A buffered range ends at `time`, give or take a few audio frames: where a run appends next.
   */
  private endsRangeAt(time: number): boolean {
    const { buffered } = this.parts.element;
    for (let index = 0; index < buffered.length; index += 1) {
      if (Math.abs(buffered.end(index) - time) <= RANGE_END_SECONDS) return true;
    }
    return false;
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

  /**
   * A full source buffer is made room in once, keeping only the window the playhead needs, and
   * the segment appended again: the feeder's own eviction keeps what lies behind in bounds, not
   * what earlier positions left ahead.
   */
  private async append(segment: Uint8Array<ArrayBuffer>): Promise<void> {
    try {
      await this.appendOnce(segment);
    } catch (error) {
      if (!isQuotaExceeded(error)) throw error;
      await this.keepOnlyTheWindow();
      await this.appendOnce(segment);
    }
  }

  private async appendOnce(segment: Uint8Array<ArrayBuffer>): Promise<void> {
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

  /**
   * Removes what lies outside the lead-in before the playhead and the window ahead of it.
   */
  private async keepOnlyTheWindow(): Promise<void> {
    const { currentTime } = this.parts.element;
    const { duration } = this.parts.mediaSource;
    await this.remove(0, currentTime - LEAD_IN_SECONDS);
    await this.remove(currentTime + BUFFER_AHEAD_SECONDS, duration);
  }

  private async remove(start: number, end: number): Promise<void> {
    if (end <= Math.max(start, 0)) return;
    await this.settlePendingAppend();
    const done = nextOfEvents(this.parts.sourceBuffer, ['updateend']);
    this.parts.sourceBuffer.remove(Math.max(start, 0), end);
    await done;
  }

  /**
   * The element failed: every append now throws, and the element's own error says why, not the
   * feeder's.
   */
  private hasElementFailed(): boolean {
    return this.parts.element.error !== null;
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

/**
 * The source buffer has no room left; the cause a `decode` failure carries.
 */
function isQuotaExceeded(error: unknown): boolean {
  return error instanceof GyroViewError && isNamed(error.cause, 'QuotaExceededError');
}

function isNamed(error: unknown, name: string): boolean {
  return error instanceof Error && error.name === name;
}
