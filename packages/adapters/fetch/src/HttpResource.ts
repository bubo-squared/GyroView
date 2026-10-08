import {
  GyroViewError,
  hasErrorCode,
  isAbortError,
  milliseconds,
  millisecondsToSeconds,
  type ByteRange,
  type Seconds,
} from '@gyroview/core';

import {
  discardBody,
  EXPOSED_HEADERS_ADVICE,
  FIRST_BYTE_RANGE,
  httpRequest,
  plainHttpRequest,
  withAbortSignal,
  type HttpMethod,
  type HttpRequestOptions,
} from './httpRequest';
import { contentRangeOf } from './contentRange';
import { isPassing, isUnreachable, passing, passingIfUnreachable } from './passingFailures';
import { isSameVersion, versionOf, type RecordingVersion } from './recordingVersion';

const HTTP_OK = 200;
const HTTP_PARTIAL_CONTENT = 206;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVER_ERROR = 500;
const HTTP_NOT_IMPLEMENTED = 501;
const FIRST_BYTE_HEADERS = { Range: FIRST_BYTE_RANGE };
/**
 * The waits before asking again for a request that failed on the way: a blink of a mobile network
 * or a restarting server passes within them, a network that is gone does not.
 */
const FIRST_RETRY_DELAY_MS = 250;
const SECOND_RETRY_DELAY_MS = 1000;
const DEFAULT_RETRY_DELAYS_MS: readonly number[] = [FIRST_RETRY_DELAY_MS, SECOND_RETRY_DELAY_MS];

export interface HttpResourceOptions extends HttpRequestOptions {
  /**
   * The waits before each new attempt at a request that failed on the way (a dropped
   * connection, a server error); as many retries as waits. Default 250 ms, then 1 s.
   */
  readonly retryDelaysMs?: readonly number[];
  /**
   * The clock its requests are timed by, in milliseconds (`answerWait`). Default
   * `performance.now`.
   */
  readonly now?: () => number;
}

/**
 * One recording at a URL, as every reader of it sees it: its size, whether its server has shown
 * it lets this page read it (CORS), the version its first answer told of (ADR 0029), and how a
 * request that failed on the way is asked for again.
 * The server must answer `Range` requests with 206 and, for cross-origin use, send CORS headers
 * that expose `Content-Range`; both are hard requirements of playing a remote recording and are
 * reported with distinct error codes.
 */
export class HttpResource {
  private readonly options: HttpRequestOptions;
  private readonly retryDelaysMs: readonly number[];
  private sizePromise: Promise<number> | undefined;
  /**
   * A range has come through: CORS is proven for this resource, so a request that fails from
   * here on failed on the way, whatever the diagnosis says of an error page without CORS headers.
   */
  private hasReadRange = false;
  private version: RecordingVersion | undefined;
  private readonly now: () => number;
  private shortestAnswerMs: number | undefined;

  /**
   * `signal` ends every request made for the resource, with the host's own `requestInit` signal.
   */
  public constructor(
    public readonly url: string,
    options: HttpResourceOptions = {},
    signal?: AbortSignal,
  ) {
    this.options = signal ? withAbortSignal(options, signal) : options;
    this.retryDelaysMs = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
    this.now = options.now ?? ((): number => performance.now());
  }

  /**
   * How long its server took to answer a byte range, from asking to the answer's headers: the
   * shortest wait of the ranges answered so far, so a first one slowed by a new connection, a
   * CORS preflight or a cold cache counts for nothing (ADR 0044). A HEAD, which a server may
   * answer from what it knows of the file without reading it, and a refusal tell nothing.
   * Undefined until a range was answered.
   */
  public answerWait(): Seconds | undefined {
    const shortest = this.shortestAnswerMs;
    return shortest === undefined ? undefined : millisecondsToSeconds(milliseconds(shortest));
  }

  /**
   * One HEAD request (or a one-byte range where HEAD is refused or gives no length), each asked
   * for again as a range is while it fails on the way (ADR 0019); cached for the lifetime of the
   * resource once it succeeded; a failed lookup is retried on the next call.
   */
  public size(): Promise<number> {
    this.sizePromise ??= this.rememberSize();
    return this.sizePromise;
  }

  /**
   * Servers clamp out-of-range requests instead of failing them; the port contracts want a
   * typed error, so the range is checked against the (cached) size first.
   */
  public async ensureFits(range: ByteRange): Promise<void> {
    range.ensureWithin(await this.size(), `resource ${this.url}`);
  }

  /**
   * Runs `attempt`, and after a short wait again, a few times, while it fails on the way: one
   * dropped connection must not end a long playback, nor a server's 5xx or its 429 asking the
   * player to slow down. What asking again cannot change (an abort, any other refusal, a server
   * ignoring ranges, CORS) fails at once.
   */
  public async askingAgain<T>(attempt: () => Promise<T>): Promise<T> {
    for (const delayMs of this.retryDelaysMs) {
      try {
        return await attempt();
      } catch (error) {
        if (!isPassing(error)) throw error;
      }
      await wait(delayMs, this.options.requestInit?.signal);
    }
    return attempt();
  }

  /**
   * The server's answer to a byte range, its body still to be read: a 206, or the refusal it
   * amounts to. `signal` ends this request alone.
   */
  public async rangeAnswer(range: ByteRange, signal?: AbortSignal): Promise<Response> {
    const options = signal ? withAbortSignal(this.options, signal) : this.options;
    const response = await this.requestRange(range, options);
    if (response.status !== HTTP_PARTIAL_CONTENT) {
      discardBody(response);
      throw this.refusalOf(response.status);
    }
    this.hasReadRange = true;
    this.ensureUnchanged(response);
    return response;
  }

  /**
   * Every answer is of the version the first one told of: bytes of a recording replaced while it
   * plays must not be put together with the old ones'.
   */
  private ensureUnchanged(response: Response): void {
    const seen = versionOf(response);
    this.version ??= seen;
    if (isSameVersion(this.version, seen)) return;
    discardBody(response);
    throw new GyroViewError(
      'source-changed',
      `${this.url} was replaced while it played; load it again`,
    );
  }

  /**
   * A request that did not get through for want of a network is worth another try; one CORS
   * refused before any range came through is not.
   */
  private async requestRange(range: ByteRange, options: HttpRequestOptions): Promise<Response> {
    const headers = { Range: `bytes=${range.offset}-${range.end - 1}` };
    try {
      // Once CORS is proven, a failure needs no diagnosing request to the failing server.
      return await this.timed(() =>
        this.hasReadRange
          ? plainHttpRequest(this.url, { method: 'GET', headers }, options)
          : httpRequest(this.url, { method: 'GET', headers }, options),
      );
    } catch (error) {
      throw this.hasReadRange ? this.passingOnceAnswered(error) : passingIfUnreachable(error);
    }
  }

  private passingOnceAnswered(error: unknown): unknown {
    const message = `${this.url} could not be reached for a byte range`;
    return isAbortError(error)
      ? error
      : passing(new GyroViewError('source-unreadable', message, { cause: error }));
  }

  private refusalOf(status: number): GyroViewError {
    if (status === HTTP_OK) {
      return new GyroViewError(
        'range-unsupported',
        `${this.url} ignores Range requests (answered 200 to a byte range)`,
      );
    }
    const message = `${this.url} answered ${status} to a byte range`;
    return isPassingStatus(status)
      ? passing(new GyroViewError('source-unreadable', message))
      : new GyroViewError('source-unreadable', message);
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
    const response = await this.sizeAnswer('HEAD');
    discardBody(response);
    if (isPassingStatus(response.status)) return this.sizeDespiteFailingHead(response.status);
    // A refused HEAD (a 405, a 403 from a URL signed for GET alone, a 501) says nothing about
    // the file: the byte range the player needs anyway answers, and names any real problem.
    if (!response.ok) return this.sizeFromContentRange();
    this.ensureUnchanged(response);
    const contentLength = Number(response.headers.get('content-length'));
    const hasContentLength = Number.isSafeInteger(contentLength) && contentLength > 0;
    return hasContentLength ? contentLength : this.sizeFromContentRange();
  }

  /**
   * Some servers omit Content-Length on HEAD or refuse HEAD; a one-byte range reveals the total.
   */
  private async sizeFromContentRange(): Promise<number> {
    return this.totalOfFirstByte(await this.sizeAnswer('GET', FIRST_BYTE_HEADERS));
  }

  /**
   * Its server still failed the HEAD once the waits ran out: one byte range, asked once, as the
   * server has had its waits, may yet tell the size, as from a server whose HEAD alone is broken.
   * Where that range hides Content-Range, only the HEAD could have told the size, as on Google
   * Drive's API, so the failing HEAD is named rather than the server's CORS headers.
   */
  private async sizeDespiteFailingHead(headStatus: number): Promise<number> {
    const response = await this.request('GET', FIRST_BYTE_HEADERS);
    try {
      return this.totalOfFirstByte(response);
    } catch (error) {
      if (!hasErrorCode(error, 'cors')) throw error;
      const message = `${this.url} answered ${headStatus} to HEAD each time, and its byte ranges hide Content-Range; cannot determine the file size`;
      throw new GyroViewError('source-unreadable', message, { cause: error });
    }
  }

  private totalOfFirstByte(response: Response): number {
    discardBody(response);
    // A whole-page 200 here is as often a missing file behind a fallback page as a server that
    // ignores ranges, so it stays unreadable; the status tells the host which.
    if (response.status !== HTTP_PARTIAL_CONTENT) {
      throw new GyroViewError(
        'source-unreadable',
        `${this.url} answered ${response.status} to a byte range; cannot determine the file size`,
      );
    }
    this.hasReadRange = true;
    this.ensureUnchanged(response);
    return this.totalOf(response);
  }

  private totalOf(response: Response): number {
    // Across origins the header is hidden unless the server exposes it.
    const isHidden = !response.headers.has('content-range') && response.type === 'cors';
    if (isHidden) throw this.hiddenContentRange();
    const total = contentRangeOf(response)?.total;
    if (total === undefined) {
      throw new GyroViewError(
        'source-unreadable',
        `${this.url} reports neither Content-Length nor Content-Range; cannot determine the file size`,
      );
    }
    return total;
  }

  private hiddenContentRange(): GyroViewError {
    return new GyroViewError(
      'cors',
      `${this.url} answered a byte range but hides its Content-Range from this origin; add ${EXPOSED_HEADERS_ADVICE}`,
    );
  }

  /**
   * The answer to a request for the size, asked for again while it fails on the way. Once the
   * waits ran out the last answer, or failure, stands as any other would, so a reader that sizes
   * inside its own retries does not ask a failing server again.
   */
  private async sizeAnswer(
    method: HttpMethod,
    headers?: Record<string, string>,
  ): Promise<Response> {
    for (const delayMs of this.retryDelaysMs) {
      const response = await this.answerUnlessFailedOnTheWay(method, headers);
      if (response !== undefined) return response;
      await wait(delayMs, this.options.requestInit?.signal);
    }
    return this.request(method, headers);
  }

  /**
   * The server's answer; undefined when the request failed on the way: a server error, a 429, or
   * a network that did not carry it.
   */
  private async answerUnlessFailedOnTheWay(
    method: HttpMethod,
    headers?: Record<string, string>,
  ): Promise<Response | undefined> {
    let response: Response;
    try {
      response = await this.request(method, headers);
    } catch (error) {
      if (isUnreachable(error)) return undefined;
      throw error;
    }
    if (!isPassingStatus(response.status)) return response;
    discardBody(response);
    return undefined;
  }

  private request(method: HttpMethod, headers?: Record<string, string>): Promise<Response> {
    return this.timed(() =>
      httpRequest(this.url, { method, ...(headers && { headers }) }, this.options),
    );
  }

  /**
   * The request, its wait noted when it brought a range's bytes (206); one that failed, was
   * given up or was refused tells nothing.
   */
  private async timed(send: () => Promise<Response>): Promise<Response> {
    const askedAt = this.now();
    const response = await send();
    if (response.status !== HTTP_PARTIAL_CONTENT) return response;
    const waitMs = this.now() - askedAt;
    this.shortestAnswerMs = Math.min(waitMs, this.shortestAnswerMs ?? waitMs);
    return response;
  }
}

/**
 * A server error, or a server asking the player to slow down (429, as rate-limited APIs answer):
 * both may pass by the time the request is made again. Any other refusal stands, and so does a
 * 501, by which a server says it does not do what was asked: a HEAD it does not implement falls
 * back to a range at once.
 */
function isPassingStatus(status: number): boolean {
  const isServerError = status >= HTTP_SERVER_ERROR && status !== HTTP_NOT_IMPLEMENTED;
  return isServerError || status === HTTP_TOO_MANY_REQUESTS;
}

/**
 * A pause before asking again, which an abort of the resource's requests ends at once.
 */
function wait(ms: number, signal: AbortSignal | null | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const settled = new AbortController();
    const timer = setTimeout(() => {
      settled.abort();
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(abortErrorOf(signal));
    };
    signal?.addEventListener('abort', onAbort, { once: true, signal: settled.signal });
  });
}

function abortErrorOf(signal: AbortSignal | null | undefined): Error {
  const reason: unknown = signal?.reason;
  return reason instanceof Error ? reason : new DOMException('the read was aborted', 'AbortError');
}
