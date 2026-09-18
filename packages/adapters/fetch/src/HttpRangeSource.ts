import { GyroViewError, type ByteRange, type RandomAccessSource } from '@gyroview/core';

const HTTP_OK = 200;
const HTTP_PARTIAL_CONTENT = 206;
const CONTENT_RANGE_TOTAL = /\/(\d+)$/u;

export interface HttpRangeSourceOptions {
  /**
   * Extra request settings, for example credentials or headers. `Range` is set by the source.
   */
  readonly requestInit?: RequestInit;
  readonly fetch?: typeof fetch;
}

/**
 * RandomAccessSource over HTTP. The server must answer `Range` requests with 206 and, for
 * cross-origin use, send CORS headers that expose `Content-Range`; both are hard requirements
 * of playing a remote recording and are reported with distinct error codes.
 */
export class HttpRangeSource implements RandomAccessSource {
  private sizePromise: Promise<number> | undefined;

  public constructor(
    public readonly url: string,
    private readonly options: HttpRangeSourceOptions = {},
  ) {}

  /**
   * One HEAD request, cached for the lifetime of the source.
   */
  public size(): Promise<number> {
    this.sizePromise ??= this.fetchSize();
    return this.sizePromise;
  }

  public async read(range: ByteRange): Promise<Uint8Array> {
    if (range.length === 0) return new Uint8Array();
    await this.ensureFits(range);
    const response = await this.request({ Range: `bytes=${range.offset}-${range.end - 1}` }, 'GET');
    if (response.status === HTTP_OK) {
      throw new GyroViewError(
        'range-unsupported',
        `${this.url} ignores Range requests (answered 200 to a byte range)`,
      );
    }
    if (response.status !== HTTP_PARTIAL_CONTENT) {
      throw new GyroViewError(
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
    const size = await this.size();
    if (!range.fitsWithin(size)) {
      throw new GyroViewError(
        'invalid-byte-range',
        `range ${range.offset}+${range.length} exceeds the ${size}-byte resource ${this.url}`,
      );
    }
  }

  private async fetchSize(): Promise<number> {
    const response = await this.request({}, 'HEAD');
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
   * Some servers omit Content-Length on HEAD; a one-byte range then reveals the total.
   */
  private async sizeFromContentRange(): Promise<number> {
    const response = await this.request({ Range: 'bytes=0-0' }, 'GET');
    const total = CONTENT_RANGE_TOTAL.exec(response.headers.get('content-range') ?? '')?.[1];
    if (total === undefined || response.status !== HTTP_PARTIAL_CONTENT) {
      throw new GyroViewError(
        'source-unreadable',
        `${this.url} reports neither Content-Length nor Content-Range; cannot determine the file size`,
      );
    }
    return Number(total);
  }

  private async request(
    headers: Record<string, string>,
    method: 'GET' | 'HEAD',
  ): Promise<Response> {
    const doFetch = this.options.fetch ?? fetch;
    try {
      return await doFetch(this.url, {
        ...this.options.requestInit,
        method,
        headers: { ...headersOf(this.options.requestInit), ...headers },
      });
    } catch (error) {
      throw new GyroViewError(
        'source-unreadable',
        `${this.url} could not be fetched; check the URL, the network and the server's CORS headers`,
        { cause: error },
      );
    }
  }
}

function headersOf(init: RequestInit | undefined): Record<string, string> {
  return Object.fromEntries(new Headers(init?.headers).entries());
}
