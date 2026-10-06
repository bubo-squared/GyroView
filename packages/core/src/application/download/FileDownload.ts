import { BlockStore } from './BlockStore';
import { SampleCursor, type CursorHost } from './SampleCursor';
import { Transfers } from './Transfers';
import type { SampleTable } from '../../domain/container/SampleTable';
import type { TrackSampleTable } from '../../domain/container/TrackSampleTable';
import type { DownloadPolicy } from '../../domain/download/DownloadPolicy';
import { isReadyToResume } from '../../domain/download/isReadyToResume';
import {
  planDownloads,
  type CursorPosition,
  type DownloadDecisions,
  type WindowAnchor,
} from '../../domain/download/planDownloads';
import type { MediaBuffer } from '../../ports/MediaBuffer';
import type { ByteStream } from '../../ports/ByteStream';
import { ByteRange } from '../../shared/binary/ByteRange';
import { ByteRangeSet } from '../../shared/binary/ByteRangeSet';
import { asGyroViewError, ensureInvariant } from '../../shared/errors/GyroViewError';
import type { Seconds } from '../../shared/units/time';

export type { CursorSample, SampleCursor } from './SampleCursor';

const EVERY_BYTE = ByteRange.of(0, Number.MAX_SAFE_INTEGER);

export interface FileDownloadParts {
  readonly table: SampleTable;
  readonly stream: ByteStream;
  readonly policy: DownloadPolicy;
}

interface FailedRange {
  readonly range: ByteRange;
  readonly error: Error;
  /**
   * A reader waited for the range when it failed. One read ahead that failed is asked for once
   * more when a reader comes to it (ADR 0019).
   */
  readonly wasNeeded: boolean;
}

/**
 * One file of a recording downloaded while it plays (ADR 0029): the only reader of its bytes.
 * Its cursors say where the readers of its tracks stand. It plans anew, once per turn, what to
 * ask for, give up and let go of when a cursor opens, closes or waits for bytes no transfer
 * brings, once the cursors have moved on by the policy's replan bytes (ADR 0036), when a range
 * comes whole or fails, and when reading ahead starts; it hands each waiting cursor its sample
 * once the bytes have come. A range that failed while a cursor waited for it is not asked for
 * again until a cursor opens, a seek or a replay, lest a failing server be asked without end; one
 * that failed while read ahead is asked for once more when a cursor comes to it, and fails the
 * read only if that fails too, so an outage while reading ahead costs nothing once it is over.
 */
export class FileDownload implements MediaBuffer {
  private readonly store = new BlockStore();
  private readonly progressListeners = new Set<() => void>();
  private readonly transfers: Transfers;
  private readonly cursors = new Set<SampleCursor>();
  private readonly host: CursorHost;
  private failures: FailedRange[] = [];
  private anchor: WindowAnchor | undefined;
  private isReadingAhead = false;
  private isPlanDue = false;
  /**
   * What the readers have taken since the last plan.
   */
  private takenSincePlan = 0;
  private isDisposed = false;

  public constructor(private readonly parts: FileDownloadParts) {
    this.transfers = new Transfers({
      stream: parts.stream,
      store: this.store,
      listener: {
        onChunk: (): void => {
          this.serveCursors();
          for (const listener of this.progressListeners) listener();
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
   * A reader of `track` from `sample` on, reading toward `target` at once.
   */
  public openCursor(track: TrackSampleTable, sample: number, target?: Seconds): SampleCursor {
    ensureInvariant(this.parts.table.tracks.includes(track), 'the track is not one of this file');
    const cursor = new SampleCursor(track, { sample, target }, this.host);
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

  /**
   * Enough is downloaded ahead of its pictures for playback that starved at `time` to play again.
   */
  public isReadyToResumeAt(time: Seconds): boolean {
    return isReadyToResume({
      cursors: this.positions(),
      held: this.store.held,
      time,
      policy: this.parts.policy,
    });
  }

  public onProgress(listener: () => void): () => void {
    const own = (): void => {
      listener();
    };
    this.progressListeners.add(own);
    return (): void => {
      this.progressListeners.delete(own);
    };
  }

  public dispose(): void {
    this.isDisposed = true;
    this.transfers.cancelAll();
    for (const cursor of this.cursors) cursor.close();
  }

  private cursorHost(): CursorHost {
    return {
      bytesOf: (range): Uint8Array | undefined => this.store.bytesOf(range),
      failureOf: (range): Error | undefined => this.failureWhenNeeded(range),
      movedOn: (length): void => {
        this.takenSincePlan += length;
        if (this.takenSincePlan >= this.parts.policy.replanBytes) this.schedulePlan();
      },
      // Bytes a transfer brings come without a plan: one made now would ask nothing for this
      // cursor, and in a simulated playback changed no decision; the next plan tops up.
      waiting: (range): void => {
        if (!this.transfers.isBringing(range)) this.schedulePlan();
      },
      closed: (cursor): void => {
        this.cursors.delete(cursor);
        this.schedulePlan();
      },
    };
  }

  /**
   * Why `range`, which a cursor needs now, cannot be read: a failure while it was needed. One
   * while it was read ahead is forgotten, so the cursor's wait asks for it again.
   */
  private failureWhenNeeded(range: ByteRange): Error | undefined {
    const failed = this.failures.find((failure) => failure.range.overlaps(range));
    if (failed === undefined || failed.wasNeeded) return failed?.error;
    this.failures = this.failures.filter((failure) => failure !== failed);
    return undefined;
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
    if (this.isDisposed) return;
    try {
      this.plan();
    } catch (error) {
      this.failEveryRead(error);
    }
  }

  /**
   * A plan that could not be made fails every read, rather than leave them waiting for ever.
   */
  private failEveryRead(cause: unknown): void {
    const error = asGyroViewError(cause, 'invariant-violation', 'the download could not plan');
    this.failures.push({ range: EVERY_BYTE, error, wasNeeded: true });
    for (const cursor of this.cursors) cursor.fail(EVERY_BYTE, error);
  }

  private plan(): void {
    this.takenSincePlan = 0;
    const decisions = planDownloads({
      cursors: this.positions(),
      held: this.store.held,
      transfers: this.transfers.states,
      unreadable: ByteRangeSet.of(this.failures.map((failure) => failure.range)),
      isReadingAhead: this.isReadingAhead,
      anchor: this.anchor,
      policy: this.parts.policy,
    });
    this.anchor = decisions.anchor;
    this.carryOut(decisions);
  }

  private positions(): CursorPosition[] {
    return [...this.cursors].map((cursor) => ({
      track: cursor.track,
      sample: cursor.position,
      isWaiting: cursor.isWaiting,
      target: cursor.target,
    }));
  }

  private carryOut(decisions: DownloadDecisions): void {
    for (const id of decisions.cancel) this.transfers.cancel(id);
    this.store.release(decisions.release);
    for (const range of decisions.start) this.transfers.start(range);
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
    let wasNeeded = false;
    for (const cursor of this.cursors) wasNeeded = cursor.fail(range, error) || wasNeeded;
    this.failures.push({ range, error, wasNeeded });
    this.schedulePlan();
  }
}
