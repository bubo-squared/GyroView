import type { ByteStream } from '../ports/ByteStream';
import { ITERATION_END } from '../shared/async/iteration';
import type { ByteRange } from '../shared/binary/ByteRange';

/**
 * How the simulated network carries bytes: so many a tick, shared evenly by the requests
 * streaming, each starting only after its latency.
 */
export interface SimulatedNetwork {
  readonly bytesPerTick: number;
  readonly latencyTicks: number;
}

/**
 * One request made over the link, as far as it had got when looked at.
 */
export interface SimulatedRequest {
  readonly range: ByteRange;
  readonly startedAt: number;
  readonly deliveredBytes: number;
  /**
   * The tick it ended at: all bytes delivered, given up, or failed.
   */
  readonly endedAt: number | undefined;
  readonly wasGivenUp: boolean;
  readonly hasFailed: boolean;
}

interface Failure {
  readonly isFailing: (range: ByteRange) => boolean;
  readonly error: Error;
}

/**
 * A network in virtual time, for tests of what streams byte ranges while a recording plays: the
 * test advances the ticks, the link delivers the bytes each tick carries and logs every request,
 * so what was asked for, what came and what was given up can be asserted to the byte.
 */
export class SimulatedLink implements ByteStream {
  private now = 0;
  private readonly transfers: LinkTransfer[] = [];
  private failure: Failure | undefined;

  public constructor(
    private readonly bytes: Uint8Array,
    private readonly network: SimulatedNetwork,
  ) {}

  public get tick(): number {
    return this.now;
  }

  public get requests(): SimulatedRequest[] {
    return this.transfers.map((transfer) => transfer.snapshot());
  }

  public get deliveredBytes(): number {
    return this.requests.reduce((total, request) => total + request.deliveredBytes, 0);
  }

  public stream(range: ByteRange): AsyncIterable<Uint8Array> {
    return { [Symbol.asyncIterator]: (): AsyncIterator<Uint8Array> => this.open(range) };
  }

  /**
   * Requests made from now on whose range `isFailing` picks fail on the first tick that would
   * carry their bytes.
   */
  public failWhere(isFailing: (range: ByteRange) => boolean, error: Error): void {
    this.failure = { isFailing, error };
  }

  public advance(ticks = 1): void {
    for (let passed = 0; passed < ticks; passed += 1) {
      this.now += 1;
      this.carry();
    }
  }

  private open(range: ByteRange): LinkTransfer {
    const failure = this.failure?.isFailing(range) === true ? this.failure.error : undefined;
    const transfer = new LinkTransfer({
      range,
      bytes: this.bytes,
      startedAt: this.now,
      failure,
      now: (): number => this.now,
    });
    this.transfers.push(transfer);
    return transfer;
  }

  private carry(): void {
    const latestStart = this.now - this.network.latencyTicks;
    const streaming = this.transfers.filter((transfer) => transfer.isStreamingSince(latestStart));
    if (streaming.length === 0) return;
    const share = Math.max(1, Math.floor(this.network.bytesPerTick / streaming.length));
    for (const transfer of streaming) transfer.deliver(share);
  }
}

interface TransferParts {
  readonly range: ByteRange;
  readonly bytes: Uint8Array;
  readonly startedAt: number;
  readonly failure: Error | undefined;
  readonly now: () => number;
}

/**
 * One request's bytes: delivered by the link tick by tick, taken by its iteration.
 */
class LinkTransfer implements AsyncIterator<Uint8Array> {
  private delivered = 0;
  private taken = 0;
  private endedAt: number | undefined;
  private wasGivenUp = false;
  private hasFailed = false;
  private wake: (() => void) | undefined;

  public constructor(private readonly parts: TransferParts) {}

  public isStreamingSince(latestStart: number): boolean {
    return this.endedAt === undefined && this.parts.startedAt <= latestStart;
  }

  public deliver(byteCount: number): void {
    if (this.parts.failure) this.hasFailed = true;
    else this.delivered = Math.min(this.parts.range.length, this.delivered + byteCount);
    if (this.hasFailed || this.delivered === this.parts.range.length) this.end();
    else this.wakeTaker();
  }

  public async next(): Promise<IteratorResult<Uint8Array>> {
    await Promise.resolve();
    this.parts.range.ensureWithin(this.parts.bytes.byteLength, 'simulated file');
    while (this.isWaiting()) await new Promise<void>((resolve) => (this.wake = resolve));
    if (this.wasGivenUp) return ITERATION_END;
    if (this.hasFailed) throw this.parts.failure ?? new Error('the simulated request failed');
    return this.taken === this.delivered ? ITERATION_END : { done: false, value: this.take() };
  }

  public return(): Promise<IteratorResult<Uint8Array>> {
    if (this.endedAt === undefined) this.wasGivenUp = true;
    this.end();
    return Promise.resolve(ITERATION_END);
  }

  public snapshot(): SimulatedRequest {
    const { range, startedAt } = this.parts;
    const { delivered: deliveredBytes, endedAt, wasGivenUp, hasFailed } = this;
    return { range, startedAt, deliveredBytes, endedAt, wasGivenUp, hasFailed };
  }

  private isWaiting(): boolean {
    const hasNothingNew = this.taken === this.delivered && this.delivered < this.parts.range.length;
    return hasNothingNew && !this.wasGivenUp && !this.hasFailed;
  }

  private take(): Uint8Array {
    const { offset } = this.parts.range;
    const chunk = this.parts.bytes.slice(offset + this.taken, offset + this.delivered);
    this.taken = this.delivered;
    return chunk;
  }

  private end(): void {
    this.endedAt ??= this.parts.now();
    this.wakeTaker();
  }

  private wakeTaker(): void {
    const wake = this.wake;
    this.wake = undefined;
    wake?.();
  }
}
