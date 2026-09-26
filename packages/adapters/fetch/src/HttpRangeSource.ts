import { GyroViewError, type ByteRange, type RandomAccessSource } from '@gyroview/core';

import {
  discardBody,
  FIRST_BYTE_RANGE,
  HTTP_METHOD_NOT_ALLOWED,
  httpRequest,
  type HttpMethod,
  type HttpRequestOptions,
} from './httpRequest';

const HTTP_OK = 200;
const HTTP_PARTIAL_CONTENT = 206;
const CONTENT_RANGE_TOTAL = /\/(\d+)$/u;

/**
 * RandomAccessSource over HTTP. The server must answer `Range` requests with 206 and, for
 * cross-origin use, send CORS headers that expose `Content-Range`; both are hard requirements
 * of playing a remote recording and are reported with distinct error codes.
 */
export class HttpRangeSource implements RandomAccessSource {
  private sizePromise: Promise<number> | undefined;

  public constructor(
    private readonly url: string,
    private readonly options: HttpRequestOptions = {},
  ) {}

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
    if (range.length === 0) return new Uint8Array();
    const response = await this.request('GET', { Range: `bytes=${range.offset}-${range.end - 1}` });
    if (response.status !== HTTP_PARTIAL_CONTENT) {
      discardBody(response);
      throw response.status === HTTP_OK
        ? new GyroViewError(
            'range-unsupported',
            `${this.url} ignores Range requests (answered 200 to a byte range)`,
          )
        : new GyroViewError(
            'source-unreadable',
            `${this.url} answered ${response.status} to a byte range`,
          );
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength !== range.length) {
      throw new GyroViewError(
        'source-truncated',
        `${this.url} returned ${bytes.byteLength} bytes for a ${range.length}-byte range at ${range.offset}`,
      );
    }
    return bytes;
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
    if (response.status === HTTP_METHOD_NOT_ALLOWED) return this.sizeFromContentRange();
    if (!response.ok) {
      throw new GyroViewError(
        'source-unreadable',
        `${this.url} answered ${response.status} to HEAD`,
      );
    }
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
