import type { TrackSampleTable } from '../../domain/container/TrackSampleTable';
import type { ByteRange } from '../../shared/binary/ByteRange';
import { ensureInvariant } from '../../shared/errors/GyroViewError';

/**
 * A sample a cursor handed out: its number in the track, and its bytes.
 */
export interface CursorSample {
  readonly sample: number;
  readonly bytes: Uint8Array;
}

/**
 * What a cursor asks of the download it reads from.
 */
export interface CursorHost {
  /**
   * The bytes of `range` if they have all come; the reason they never will, if they failed.
   */
  bytesOf(range: ByteRange): Uint8Array | undefined;
  failureOf(range: ByteRange): Error | undefined;
  /**
   * The cursor moved on, began waiting or closed: what to read may have changed.
   */
  changed(cursor: SampleCursor): void;
  closed(cursor: SampleCursor): void;
}

interface Waiter {
  readonly resolve: (sample: CursorSample | undefined) => void;
  readonly reject: (error: Error) => void;
}

/**
 * One reader of a track's samples, from a sample on, in decode order: the next sample is handed
 * out once its bytes have come, a read at a time. Closing it hands out no more, a read awaited
 * then coming as the end, so the download stops reading for it at once.
 */
export class SampleCursor {
  private next: number;
  private waiter: Waiter | undefined;
  private isClosed = false;

  public constructor(
    public readonly track: TrackSampleTable,
    start: number,
    private readonly host: CursorHost,
  ) {
    this.next = start;
  }

  /**
   * The next sample it hands out.
   */
  public get position(): number {
    return this.next;
  }

  public get isWaiting(): boolean {
    return this.waiter !== undefined;
  }

  /**
   * The next sample; undefined at the track's end or once closed. Rejects when its bytes failed.
   */
  public nextSample(): Promise<CursorSample | undefined> {
    if (this.isClosed || this.next >= this.track.sampleCount) return Promise.resolve(undefined);
    ensureInvariant(this.waiter === undefined, 'a cursor reads one sample at a time');
    const range = this.track.rangeOf(this.next);
    const failure = this.host.failureOf(range);
    if (failure !== undefined) return Promise.reject(failure);
    const bytes = this.host.bytesOf(range);
    return bytes ? Promise.resolve(this.take(bytes)) : this.waitForBytes();
  }

  /**
   * Bytes came: hands the awaited sample on if they were its.
   */
  public serve(): void {
    const { waiter } = this;
    const bytes = waiter && this.host.bytesOf(this.track.rangeOf(this.next));
    if (!waiter || !bytes) return;
    this.waiter = undefined;
    waiter.resolve(this.take(bytes));
  }

  /**
   * A range failed: fails the awaited read if the sample lies there.
   */
  public fail(range: ByteRange, error: Error): void {
    const { waiter } = this;
    if (waiter === undefined) return;
    const awaited = this.track.rangeOf(this.next);
    if (awaited.end <= range.offset || range.end <= awaited.offset) return;
    this.waiter = undefined;
    waiter.reject(error);
  }

  public close(): void {
    if (this.isClosed) return;
    this.isClosed = true;
    this.waiter?.resolve(undefined);
    this.waiter = undefined;
    this.host.closed(this);
  }

  private waitForBytes(): Promise<CursorSample | undefined> {
    return new Promise((resolve, reject) => {
      this.waiter = { resolve, reject };
      this.host.changed(this);
    });
  }

  private take(bytes: Uint8Array): CursorSample {
    const sample = this.next;
    this.next += 1;
    this.host.changed(this);
    return { sample, bytes };
  }
}
