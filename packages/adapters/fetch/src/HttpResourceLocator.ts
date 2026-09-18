import type { ResourceLocator } from '@gyroview/core';

const HTTP_METHOD_NOT_ALLOWED = 405;
const FIRST_BYTE_RANGE = 'bytes=0-0';

export interface HttpResourceLocatorOptions {
  /**
   * Extra request settings, for example credentials or headers, shared with the range source.
   */
  readonly requestInit?: RequestInit;
  readonly fetch?: typeof fetch;
}

/**
 * ResourceLocator over HTTP: one HEAD request, or a one-byte GET when the server does not allow
 * HEAD. Every failure, including a missing CORS header, means "not available"; companion files
 * are optional, so nothing here throws.
 */
export class HttpResourceLocator implements ResourceLocator {
  public constructor(private readonly options: HttpResourceLocatorOptions = {}) {}

  public async exists(url: string): Promise<boolean> {
    try {
      const head = await this.request(url, 'HEAD', {});
      if (head.status !== HTTP_METHOD_NOT_ALLOWED) return head.ok;
      const firstByte = await this.request(url, 'GET', { Range: FIRST_BYTE_RANGE });
      return firstByte.ok;
    } catch {
      return false;
    }
  }

  private request(
    url: string,
    method: 'GET' | 'HEAD',
    headers: Record<string, string>,
  ): Promise<Response> {
    const doFetch = this.options.fetch ?? fetch;
    return doFetch(url, {
      ...this.options.requestInit,
      method,
      headers: { ...headersOf(this.options.requestInit), ...headers },
    });
  }
}

function headersOf(init: RequestInit | undefined): Record<string, string> {
  return Object.fromEntries(new Headers(init?.headers).entries());
}
