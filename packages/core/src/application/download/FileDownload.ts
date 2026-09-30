import { BlockStore } from './BlockStore';
import { SampleCursor, type CursorHost } from './SampleCursor';
import { Transfers } from './Transfers';
import type { SampleTable } from '../../domain/container/SampleTable';
import type { TrackSampleTable } from '../../domain/container/TrackSampleTable';
import type { DownloadPolicy } from '../../domain/download/DownloadPolicy';
import { planDownloads, type DownloadDecisions } from '../../domain/download/planDownloads';
import type { ByteStream } from '../../ports/ByteStream';
import type { ByteRange } from '../../shared/binary/ByteRange';
import { asGyroViewError, ensureInvariant } from '../../shared/errors/GyroViewError';

export type { CursorSample, SampleCursor } from './SampleCursor';

export interface FileDownloadParts {
  readonly table: SampleTable;
  readonly stream: ByteStream;
  readonly policy: DownloadPolicy;
}

interface FailedRange {
  readonly range: ByteRange;
  readonly error: Error;
}

/**
 * One file of a recording downloaded while it plays (ADR 0029): the only reader of its bytes.
 * Its cursors say where the readers of its tracks stand; whenever that changes, or a range comes
 * whole, it plans anew, once per turn, what to ask for, give up and let go of, and hands each
 * waiting cursor its sample once the bytes have come. A range that failed is not asked for again
 * until a cursor opens, a seek or a replay, lest a failing server be asked without end.
 */
export class FileDownload {
  private readonly store = new BlockStore();
  private readonly transfers: Transfers;
  private readonly cursors = new Set<SampleCursor>();
  private readonly host: CursorHost;
  private failures: FailedRange[] = [];
  private isReadingAhead = false;
  private isPlanDue = false;
  private isDisposed = false;

  public constructor(private readonly parts: FileDownloadParts) {
    this.transfers = new Transfers({
      stream: parts.stream,
      store: this.store,
      listener: {
        onChunk: (): void => {
          this.serveCursors();
        },
        onEnd: (): void => {
          this.schedulePlan();
        },
        onFailure: (range, error): void => {
          this.fail(range, error);
        },
      },
    });
    this.host = this.cursorHost();
  }

  /**
   * A reader of `track` from `sample` on.
   */
  public openCursor(track: TrackSampleTable, sample: number): SampleCursor {
    ensureInvariant(this.parts.table.tracks.includes(track), 'the track is not one of this file');
    const cursor = new SampleCursor(track, sample, this.host);
    if (this.isDisposed) {
      cursor.close();
      return cursor;
    }
    this.failures = [];
    this.cursors.add(cursor);
    this.schedulePlan();
    return cursor;
  }

  /**
   * Playing has started: from now on the download reads ahead of the picture.
   */
  public startReadingAhead(): void {
    this.isReadingAhead = true;
    this.schedulePlan();
  }

  public dispose(): void {
    this.isDisposed = true;
    this.transfers.cancelAll();
    for (const cursor of this.cursors) cursor.close();
  }

  private cursorHost(): CursorHost {
    return {
      bytesOf: (range): Uint8Array | undefined => this.store.bytesOf(range),
      failureOf: (range): Error | undefined =>
        this.failures.find((failed) => isOverlapping(failed.range, range))?.error,
      changed: (): void => {
        this.schedulePlan();
      },
      closed: (cursor): void => {
        this.cursors.delete(cursor);
        this.schedulePlan();
      },
    };
  }

  private schedulePlan(): void {
    if (this.isPlanDue || this.isDisposed) return;
    this.isPlanDue = true;
    void this.planAfterThisTurn();
  }

  /**
   * Plans once every change made in this turn is in: a seek closes its old cursors and opens
   * its new ones together, and the plan sees both.
   */
  private async planAfterThisTurn(): Promise<void> {
    await Promise.resolve();
    this.isPlanDue = false;
    this.plan();
  }

  private plan(): void {
    if (this.isDisposed) return;
    const decisions = planDownloads({
      cursors: [...this.cursors].map((cursor) => ({
        track: cursor.track,
        sample: cursor.position,
        isWaiting: cursor.isWaiting,
      })),
      held: this.store.held,
      transfers: this.transfers.states,
      isReadingAhead: this.isReadingAhead,
      policy: this.parts.policy,
    });
    this.carryOut(decisions);
    this.serveCursors();
  }

  private carryOut(decisions: DownloadDecisions): void {
    for (const id of decisions.cancel) this.transfers.cancel(id);
    this.store.release(decisions.release);
    for (const range of decisions.start) {
      const hasFailed = this.failures.some((failure) => isOverlapping(failure.range, range));
      if (!hasFailed) this.transfers.start(range);
    }
  }

  private serveCursors(): void {
    for (const cursor of this.cursors) cursor.serve();
  }

  private fail(range: ByteRange, cause: unknown): void {
    const error = asGyroViewError(
      cause,
      'source-unreadable',
      'a range of the recording could not be read',
    );
    this.failures.push({ range, error });
    for (const cursor of this.cursors) cursor.fail(range, error);
    this.schedulePlan();
  }
}

function isOverlapping(left: ByteRange, right: ByteRange): boolean {
  return left.offset < right.end && right.offset < left.end;
}
