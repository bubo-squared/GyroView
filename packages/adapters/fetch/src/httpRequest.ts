import { GyroViewError } from '@gyroview/core';

export type HttpMethod = 'GET' | 'HEAD';

export interface HttpRequestOptions {
  /**
   * Extra request settings, for example credentials or headers. `Range` is set by the caller.
   */
  readonly requestInit?: RequestInit;
  readonly fetch?: typeof fetch;
}

export interface HttpRequest {
  readonly method: HttpMethod;
  readonly headers?: Record<string, string>;
}

/**
 * One request with the shared settings merged in. Network failures, which in browsers also
 * cover missing CORS headers, become `source-unreadable` with the cause attached.
 */
export async function httpRequest(
  url: string,
  request: HttpRequest,
  options: HttpRequestOptions,
): Promise<Response> {
  const doFetch = options.fetch ?? fetch;
  try {
    return await doFetch(url, {
      ...options.requestInit,
      method: request.method,
      headers: { ...headersOf(options.requestInit), ...request.headers },
    });
  } catch (error) {
    throw new GyroViewError(
      'source-unreadable',
      `${url} could not be fetched; check the URL, the network and the server's CORS headers`,
      { cause: error },
    );
  }
}

/**
 * Lets the browser stop streaming a body that will not be read, for example a whole file
 * answered to a byte range.
 */
export function discardBody(response: Response): void {
  void response.body?.cancel();
}

function headersOf(init: RequestInit | undefined): Record<string, string> {
  return Object.fromEntries(new Headers(init?.headers).entries());
}
