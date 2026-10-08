import { GyroViewError, isAbortError, type ResourceLocator } from '@gyroview/core';

import {
  discardBody,
  FIRST_BYTE_RANGE,
  plainHttpRequest,
  withAbortSignal,
  type HttpRequest,
  type HttpRequestOptions,
} from './httpRequest';
import { answerAskedAgain, DEFAULT_RETRY_DELAYS_MS, type RetryOptions } from './askingAgain';
import { isPassingStatus } from './passingFailures';

const HTTP_FORBIDDEN = 403;
const HTTP_METHOD_NOT_ALLOWED = 405;
const HTTP_NOT_IMPLEMENTED = 501;
/**
 * How a server refuses HEAD: a 405, a 403 from a URL signed for GET alone, or a 501 from one that
 * does not implement it. The first byte then answers what HEAD would.
 */
const REFUSED_HEAD: ReadonlySet<number> = new Set([
  HTTP_METHOD_NOT_ALLOWED,
  HTTP_FORBIDDEN,
  HTTP_NOT_IMPLEMENTED,
]);
const HEAD: HttpRequest = { method: 'HEAD' };
const FIRST_BYTE: HttpRequest = { method: 'GET', headers: { Range: FIRST_BYTE_RANGE } };

export interface HttpResourceLocatorOptions extends HttpRequestOptions, RetryOptions {}

/**
 * ResourceLocator over HTTP: one HEAD request, or a one-byte GET when the server refuses HEAD,
 * asked for again after a server error or a 429 (ADR 0019), as the recording's size is. A HEAD
 * still failing is followed by the GET, asked once: a server whose HEAD alone fails still has the
 * file found. An answer that the file is not there, and a request that does not get through, a
 * missing CORS header included, mean "not available": the file looked for is optional, and no
 * request is spent explaining a failure. A server still failing once the waits ran out fails the
 * lookup with `source-unreadable`.
 */
export class HttpResourceLocator implements ResourceLocator {
  private readonly options: HttpRequestOptions;
  private readonly retryDelaysMs: readonly number[];

  /**
   * `signal` ends the lookup's requests and its waits, with the host's own `requestInit` signal.
   */
  public constructor(options: HttpResourceLocatorOptions = {}, signal?: AbortSignal) {
    this.options = signal ? withAbortSignal(options, signal) : options;
    this.retryDelaysMs = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  }

  public async exists(url: string): Promise<boolean> {
    const answer = await this.lookUp(url);
    if (answer === undefined) return false;
    if (isPassingStatus(answer.status)) {
      throw new GyroViewError(
        'source-unreadable',
        `${url} answered ${answer.status} each time it was looked for beside the recording`,
      );
    }
    return answer.ok;
  }

  /**
   * The answer to a HEAD, or to a one-byte GET where HEAD is refused or still failing; undefined
   * when a request did not get through.
   */
  private async lookUp(url: string): Promise<Response | undefined> {
    try {
      const head = await this.answerAskedAgain(url, HEAD);
      if (REFUSED_HEAD.has(head.status)) return await this.answerAskedAgain(url, FIRST_BYTE);
      return isPassingStatus(head.status) ? await this.answer(url, FIRST_BYTE) : head;
    } catch (error) {
      if (this.isAborted(error)) throw error;
      return undefined;
    }
  }

  private answerAskedAgain(url: string, request: HttpRequest): Promise<Response> {
    return answerAskedAgain(
      () => this.answer(url, request),
      this.retryDelaysMs,
      this.options.requestInit?.signal,
    );
  }

  private async answer(url: string, request: HttpRequest): Promise<Response> {
    const response = await plainHttpRequest(url, request, this.options);
    discardBody(response);
    return response;
  }

  /**
   * An abort ends the lookup whatever its reason, a timeout's included: it is no answer.
   */
  private isAborted(error: unknown): boolean {
    return isAbortError(error) || this.options.requestInit?.signal?.aborted === true;
  }
}
