import {
  GyroViewError,
  hasErrorCode,
  type ByteRange,
  type RandomAccessSource,
} from '@gyroview/core';

import {
  discardBody,
  FIRST_BYTE_RANGE,
  httpRequest,
  isAbort,
  withAbortSignal,
  type HttpMethod,
  type HttpRequestOptions,
} from './httpRequest';

const HTTP_OK = 200;
const HTTP_PARTIAL_CONTENT = 206;
const HTTP_SERVER_ERROR = 500;
/**
 * The waits before asking again for a range that failed on the way: a blink of a mobile network
 * or a restarting server passes within them, a network that is gone does not.
 */
const FIRST_RETRY_DELAY_MS = 250;
const SECOND_RETRY_DELAY_MS = 1000;
const DEFAULT_RETRY_DELAYS_MS: readonly number[] = [FIRST_RETRY_DELAY_MS, SECOND_RETRY_DELAY_MS];

export interface HttpRangeSourceOptions extends HttpRequestOptions {
  /**
   * The waits before each new attempt at a range that failed on the way (a dropped connection,
   * a server error); as many retries as waits. Default 250 ms, then 1 s.
   */
  readonly retryDelaysMs?: readonly number[];
}

/**
 * A failure on the way that asking again may cure; any other fails the read at once.
 */
class PassingFailure extends GyroViewError {}
const CONTENT_RANGE_TOTAL = /\/(\d+)$/u;

/**
 * RandomAccessSource over HTTP. The server must answer `Range` requests with 206 and, for
 * cross-origin use, send CORS headers that expose `Content-Range`; both are hard requirements
 * of playing a remote recording and are reported with distinct error codes.
 */
export class HttpRangeSource implements RandomAccessSource {
  private readonly options: HttpRequestOptions;
  private readonly retryDelaysMs: readonly number[];
  private sizePromise: Promise<number> | undefined;

  /**
   * `signal` ends every request the source makes, with the host's own `requestInit` signal.
   */
  public constructor(
    private readonly url: string,
    options: HttpRangeSourceOptions = {},
    signal?: AbortSignal,
  ) {
    this.options = signal ? withAbortSignal(options, signal) : options;
    this.retryDelaysMs = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  }

  /**
   * One HEAD request (or a one-byte range where HEAD is refused or gives no length), cached for
   * the lifetime of the source once it succeeded; a failed lookup is retried on the next call.
   */
  public size(): Promise<number> {
    this.sizePromise ??= this.rememberSize();
    return this.sizePromise;
  }

  public async read(range: ByteRange): Promise<Uint8Array> {
    await this.ensureFits(range);
    return range.length === 0 ? new Uint8Array() : this.readAskingAgain(range);
  }

  /**
   * A range that failed on the way is asked for again after a short wait, a few times: one
   * dropped connection must not end a long playback. What asking again cannot change (an abort,
   * a refusal, a server ignoring ranges, CORS) fails at once.
   */
  private async readAskingAgain(range: ByteRange): Promise<Uint8Array> {
    for (const delayMs of this.retryDelaysMs) {
      try {
        return await this.readOnce(range);
      } catch (error) {
        if (!(error instanceof PassingFailure)) throw error;
      }
      await wait(delayMs);
    }
    return this.readOnce(range);
  }

  private async readOnce(range: ByteRange): Promise<Uint8Array> {
    const response = await this.requestRange(range);
    if (response.status !== HTTP_PARTIAL_CONTENT) {
      discardBody(response);
      throw this.refusalOf(response.status);
    }
    const bytes = await this.bodyOf(response, range);
    if (bytes.byteLength !== range.length) {
      throw new GyroViewError(
        'source-truncated',
        `${this.url} returned ${bytes.byteLength} bytes for a ${range.length}-byte range at ${range.offset}`,
      );
    }
    return bytes;
  }

  /**
   * A request that did not get through for want of a network is worth another try; one CORS
   * refused is not.
   */
  private async requestRange(range: ByteRange): Promise<Response> {
    try {
      return await this.request('GET', { Range: `bytes=${range.offset}-${range.end - 1}` });
    } catch (error) {
      if (!hasErrorCode(error, 'source-unreadable') || !(error instanceof Error)) throw error;
      throw new PassingFailure('source-unreadable', error.message, { cause: error.cause });
    }
  }

  private refusalOf(status: number): GyroViewError {
    if (status === HTTP_OK) {
      return new GyroViewError(
        'range-unsupported',
        `${this.url} ignores Range requests (answered 200 to a byte range)`,
      );
    }
    const message = `${this.url} answered ${status} to a byte range`;
    return status >= HTTP_SERVER_ERROR
      ? new PassingFailure('source-unreadable', message)
      : new GyroViewError('source-unreadable', message);
  }

  /**
   * The bytes of a range, which a dropped connection can break off after the headers: the most
   * common way a network fails during long playback, so it is `source-unreadable` as a refused
   * request is, not a bug or a bad file, and worth another try.
   */
  private async bodyOf(response: Response, range: ByteRange): Promise<Uint8Array> {
    try {
      return new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      if (isAbort(error)) throw error;
      throw new PassingFailure(
        'source-unreadable',
        `${this.url} broke off the ${range.length}-byte range at ${range.offset}`,
        { cause: error },
      );
    }
  }

  /**
   * Servers clamp out-of-range requests instead of failing them; the port contract wants a
   * typed error, so the range is checked against the (cached) size first.
   */
  private async ensureFits(range: ByteRange): Promise<void> {
    range.ensureWithin(await this.size(), `resource ${this.url}`);
  }

  private async rememberSize(): Promise<number> {
    try {
      return await this.fetchSize();
    } catch (error) {
      this.sizePromise = undefined;
      throw error;
    }
  }

  private async fetchSize(): Promise<number> {
    const response = await this.request('HEAD');
    discardBody(response);
    // A refused HEAD (a 405, or a 403 from a URL signed for GET alone) says nothing about the
    // file: the byte range the player needs anyway answers, and names any real problem.
    if (!response.ok) return this.sizeFromContentRange();
    const contentLength = Number(response.headers.get('content-length'));
    const hasContentLength = Number.isSafeInteger(contentLength) && contentLength > 0;
    return hasContentLength ? contentLength : this.sizeFromContentRange();
  }

  /**
   * Some servers omit Content-Length on HEAD or refuse HEAD; a one-byte range reveals the total.
   */
  private async sizeFromContentRange(): Promise<number> {
    const response = await this.request('GET', { Range: FIRST_BYTE_RANGE });
    discardBody(response);
    // A whole-page 200 here is as often a missing file behind a fallback page as a server that
    // ignores ranges, so it stays unreadable; the status tells the host which.
    if (response.status !== HTTP_PARTIAL_CONTENT) {
      throw new GyroViewError(
        'source-unreadable',
        `${this.url} answered ${response.status} to a byte range; cannot determine the file size`,
      );
    }
    const total = CONTENT_RANGE_TOTAL.exec(response.headers.get('content-range') ?? '')?.[1];
    if (total === undefined) {
      throw new GyroViewError(
        'source-unreadable',
        `${this.url} reports neither Content-Length nor Content-Range; cannot determine the file size`,
      );
    }
    return Number(total);
  }

  private request(method: HttpMethod, headers?: Record<string, string>): Promise<Response> {
    return httpRequest(this.url, { method, ...(headers && { headers }) }, this.options);
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
