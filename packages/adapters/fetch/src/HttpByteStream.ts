import { ByteRange, GyroViewError, isAbortError, type ByteStream } from '@gyroview/core';

import type { HttpResource } from './HttpResource';
import { passing } from './passingFailures';

const DONE: IteratorReturnResult<undefined> = { done: true, value: undefined };
const CONTENT_RANGE = /^bytes (\d+)-(\d+)\//u;
/**
 * Long enough for a slow mobile network to deliver its next packet, short enough that playback
 * waiting on a dead connection recovers well before the viewer gives up.
 */
const DEFAULT_STALL_TIMEOUT_MS = 10_000;

type BodyReader = ReadableStreamDefaultReader<Uint8Array>;

export interface HttpByteStreamOptions {
  /**
   * How long a request may go without a byte before it is taken for stalled, given up and asked
   * for again from its next byte. Default 10 s.
   */
  readonly stallTimeoutMs?: number;
}

/**
 * ByteStream over HTTP: a range is one request, its body handed on a chunk at a time as it
 * comes, and given up by aborting the request. A body that breaks off or stalls is asked for
 * again from its next byte, as the resource's retry rules allow.
 */
export class HttpByteStream implements ByteStream {
  private readonly stallTimeoutMs: number;

  public constructor(
    private readonly resource: HttpResource,
    options: HttpByteStreamOptions = {},
  ) {
    this.stallTimeoutMs = options.stallTimeoutMs ?? DEFAULT_STALL_TIMEOUT_MS;
  }

  public stream(range: ByteRange): AsyncIterable<Uint8Array> {
    return {
      [Symbol.asyncIterator]: (): AsyncIterator<Uint8Array> =>
        new RangeStreaming({ resource: this.resource, range, stallTimeoutMs: this.stallTimeoutMs }),
    };
  }
}

interface StreamingParts {
  readonly resource: HttpResource;
  readonly range: ByteRange;
  readonly stallTimeoutMs: number;
}

/**
 * One request for what of the range has not come yet, and its body.
 */
interface Attempt {
  readonly request: AbortController;
  readonly body: Promise<BodyReader>;
}

/**
 * One range's requests and bodies. The answer must be the bytes asked for, every one and no
 * more; returning the iteration aborts the request at once, a chunk still awaited coming as the
 * end.
 */
class RangeStreaming implements AsyncIterator<Uint8Array> {
  private attempt: Attempt | undefined;
  private received = 0;
  private isOver = false;

  public constructor(private readonly parts: StreamingParts) {}

  public async next(): Promise<IteratorResult<Uint8Array>> {
    try {
      const chunk = await this.parts.resource.askingAgain(() => this.readChunk());
      if (chunk) return { done: false, value: chunk };
    } catch (error) {
      if (!this.hasEnded()) {
        this.end();
        throw error;
      }
    }
    this.end();
    return DONE;
  }

  public return(): Promise<IteratorResult<Uint8Array>> {
    this.end();
    return Promise.resolve(DONE);
  }

  /**
   * The next chunk; none at the range's end. An attempt that fails is dropped, so the next
   * asks anew for the rest of the range.
   */
  private async readChunk(): Promise<Uint8Array | undefined> {
    const { resource, range } = this.parts;
    await resource.ensureFits(range);
    if (this.hasEnded() || range.length === 0) return undefined;
    this.attempt ??= this.attemptAtTheRest();
    const { attempt } = this;
    try {
      const read = await this.withinStallTimeout(this.readFrom(attempt));
      return this.taken(read);
    } catch (error) {
      this.drop(attempt);
      throw error;
    }
  }

  private attemptAtTheRest(): Attempt {
    const { range } = this.parts;
    const rest = ByteRange.of(range.offset + this.received, range.length - this.received);
    const request = new AbortController();
    return { request, body: this.bodyOf(rest, request.signal) };
  }

  private async bodyOf(rest: ByteRange, signal: AbortSignal): Promise<BodyReader> {
    const response = await this.parts.resource.rangeAnswer(rest, signal);
    this.ensureAnswers(response, rest);
    return response.body?.getReader() ?? new ReadableStream<Uint8Array>().getReader();
  }

  /**
   * A server may answer other bytes than asked (a cache serving a range it holds); the answer
   * says which in its Content-Range, where the page may read it.
   */
  private ensureAnswers(response: Response, rest: ByteRange): void {
    const answered = CONTENT_RANGE.exec(response.headers.get('content-range') ?? '');
    if (!answered) return;
    const asked = `${rest.offset}-${rest.end - 1}`;
    const given = `${answered[1] ?? ''}-${answered[2] ?? ''}`;
    if (given === asked) return;
    throw new GyroViewError(
      'source-unreadable',
      `${this.parts.resource.url} answered bytes ${given} to a request for bytes ${asked}`,
    );
  }

  /**
   * A dropped connection breaks a body off after the headers: the most common way a network
   * fails during long playback, so it is `source-unreadable`, and worth another try.
   */
  private async readFrom(attempt: Attempt): Promise<ReadableStreamReadResult<Uint8Array>> {
    const body = await attempt.body;
    try {
      return await body.read();
    } catch (error) {
      if (isAbortError(error)) throw error;
      const { resource, range } = this.parts;
      const message = `${resource.url} broke off the ${range.length}-byte range at ${range.offset}`;
      throw passing(new GyroViewError('source-unreadable', message, { cause: error }));
    }
  }

  /**
   * A request that brings no byte for the stall timeout, answer or body, is taken for stalled:
   * a connection a network change left dead never fails by itself.
   */
  private async withinStallTimeout<T>(pending: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stalled = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(this.stalled());
      }, this.parts.stallTimeoutMs);
    });
    try {
      return await Promise.race([pending, stalled]);
    } finally {
      clearTimeout(timer);
    }
  }

  private stalled(): GyroViewError {
    const { resource, range, stallTimeoutMs } = this.parts;
    const message = `${resource.url} sent nothing of the ${range.length}-byte range at ${range.offset} for ${stallTimeoutMs} ms`;
    return passing(new GyroViewError('source-unreadable', message));
  }

  private taken(read: ReadableStreamReadResult<Uint8Array>): Uint8Array | undefined {
    if (read.done) {
      this.ensureWhole();
      return undefined;
    }
    this.count(read.value);
    return read.value;
  }

  private count(chunk: Uint8Array): void {
    const { resource, range } = this.parts;
    this.received += chunk.byteLength;
    if (this.received <= range.length) return;
    throw new GyroViewError(
      'source-unreadable',
      `${resource.url} sent more than the ${range.length}-byte range at ${range.offset}`,
    );
  }

  private ensureWhole(): void {
    const { resource, range } = this.parts;
    if (this.received === range.length) return;
    throw new GyroViewError(
      'source-truncated',
      `${resource.url} returned ${this.received} bytes for a ${range.length}-byte range at ${range.offset}`,
    );
  }

  private drop(attempt: Attempt): void {
    attempt.request.abort();
    if (this.attempt === attempt) this.attempt = undefined;
  }

  /**
   * Aborting the request once it is over, however it ended, also lets go of the listeners it
   * put on the resource's own signal.
   */
  private end(): void {
    this.isOver = true;
    if (this.attempt) this.drop(this.attempt);
  }

  /**
   * Asked afresh after every wait: the range may be given up meanwhile.
   */
  private hasEnded(): boolean {
    return this.isOver;
  }
}
