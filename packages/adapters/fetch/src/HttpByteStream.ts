import { GyroViewError, isAbortError, type ByteRange, type ByteStream } from '@gyroview/core';

import type { HttpResource } from './HttpResource';
import { passing } from './passingFailures';

const DONE: IteratorReturnResult<undefined> = { done: true, value: undefined };
const CONTENT_RANGE = /^bytes (\d+)-(\d+)\//u;

type BodyReader = ReadableStreamDefaultReader<Uint8Array>;

/**
 * ByteStream over HTTP: a range is one request, its body handed on a chunk at a time as it
 * comes, and given up by aborting the request.
 */
export class HttpByteStream implements ByteStream {
  public constructor(private readonly resource: HttpResource) {}

  public stream(range: ByteRange): AsyncIterable<Uint8Array> {
    return {
      [Symbol.asyncIterator]: (): AsyncIterator<Uint8Array> =>
        new RangeStreaming(this.resource, range),
    };
  }
}

/**
 * One range's request and body. The answer must be the bytes asked for, every one and no more;
 * returning the iteration aborts the request at once, a chunk still awaited coming as the end.
 */
class RangeStreaming implements AsyncIterator<Uint8Array> {
  private readonly request = new AbortController();
  private opening: Promise<BodyReader | undefined> | undefined;
  private received = 0;
  private isOver = false;

  public constructor(
    private readonly resource: HttpResource,
    private readonly range: ByteRange,
  ) {}

  public async next(): Promise<IteratorResult<Uint8Array>> {
    try {
      const chunk = await this.nextChunk();
      if (chunk) return { done: false, value: chunk };
    } catch (error) {
      if (!this.wasGivenUp()) {
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

  private async nextChunk(): Promise<Uint8Array | undefined> {
    if (this.wasGivenUp()) return undefined;
    this.opening ??= this.open();
    const body = await this.opening;
    if (!body) return undefined;
    const read = await this.readFrom(body);
    if (read.done) {
      this.ensureWhole();
      return undefined;
    }
    this.count(read.value);
    return read.value;
  }

  /**
   * The body of the answer to the range; none for an empty range, which needs no request.
   */
  private async open(): Promise<BodyReader | undefined> {
    const { resource, range } = this;
    await resource.ensureFits(range);
    if (range.length === 0) return undefined;
    const response = await resource.askingAgain(() =>
      resource.rangeAnswer(range, this.request.signal),
    );
    this.ensureAnswers(response);
    return response.body?.getReader() ?? new ReadableStream<Uint8Array>().getReader();
  }

  /**
   * A server may answer other bytes than asked (a cache serving a range it holds); the answer
   * says which in its Content-Range, where the page may read it.
   */
  private ensureAnswers(response: Response): void {
    const answered = CONTENT_RANGE.exec(response.headers.get('content-range') ?? '');
    if (!answered) return;
    const asked = `${this.range.offset}-${this.range.end - 1}`;
    const given = `${answered[1] ?? ''}-${answered[2] ?? ''}`;
    if (given === asked) return;
    throw new GyroViewError(
      'source-unreadable',
      `${this.resource.url} answered bytes ${given} to a request for bytes ${asked}`,
    );
  }

  /**
   * A dropped connection breaks a body off after the headers: the most common way a network
   * fails during long playback, so it is `source-unreadable`, and worth another try.
   */
  private async readFrom(body: BodyReader): Promise<ReadableStreamReadResult<Uint8Array>> {
    try {
      return await body.read();
    } catch (error) {
      if (isAbortError(error)) throw error;
      throw passing(
        new GyroViewError(
          'source-unreadable',
          `${this.resource.url} broke off the ${this.range.length}-byte range at ${this.range.offset}`,
          { cause: error },
        ),
      );
    }
  }

  private count(chunk: Uint8Array): void {
    this.received += chunk.byteLength;
    if (this.received <= this.range.length) return;
    throw new GyroViewError(
      'source-unreadable',
      `${this.resource.url} sent more than the ${this.range.length}-byte range at ${this.range.offset}`,
    );
  }

  private ensureWhole(): void {
    if (this.received === this.range.length) return;
    throw new GyroViewError(
      'source-truncated',
      `${this.resource.url} returned ${this.received} bytes for a ${this.range.length}-byte range at ${this.range.offset}`,
    );
  }

  /**
   * Aborting the request once it is over, however it ended, lets go of the listeners it put on
   * the resource's own signal.
   */
  private end(): void {
    this.isOver = true;
    this.request.abort();
  }

  /**
   * Asked afresh after every wait: the range may be given up meanwhile.
   */
  private wasGivenUp(): boolean {
    return this.isOver;
  }
}
