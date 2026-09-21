import { GyroViewError } from '@gyroview/core';

export type HttpMethod = 'GET' | 'HEAD';

export interface HttpRequestOptions {
  /**
   * Extra request settings, for example credentials or headers. `Range` is set by the caller.
   * Requests bypass the browser's HTTP cache unless these settings choose another `cache` mode.
   */
  readonly requestInit?: RequestInit;
  readonly fetch?: typeof fetch;
}

export interface HttpRequest {
  readonly method: HttpMethod;
  readonly headers?: Record<string, string>;
}

/**
 * Browsers keep byte ranges of one URL as a sparse cache entry and revalidate them with
 * conditional requests. A 304 to such a request makes the browser answer from that entry, and
 * Chrome has been seen to hand back an empty body for a range it believed it held (ADR 0013).
 * The demuxer caches what it needs itself, so nothing is lost by leaving the cache out.
 */
const CACHE_MODE: RequestCache = 'no-store';

/**
 * One request with the shared settings merged in. A request that fails outright is told apart
 * from one the browser blocked for want of CORS headers: the latter is `cors`, the former
 * `source-unreadable`.
 */
export async function httpRequest(
  url: string,
  request: HttpRequest,
  options: HttpRequestOptions,
): Promise<Response> {
  const doFetch = options.fetch ?? fetch;
  try {
    return await doFetch(url, {
      cache: CACHE_MODE,
      ...options.requestInit,
      method: request.method,
      headers: { ...headersOf(options.requestInit), ...request.headers },
    });
  } catch (error) {
    throw await diagnoseFailure(url, doFetch, error);
  }
}

/**
 * Browsers report a CORS refusal and a network failure alike, as a rejected fetch. A request
 * that asks for no CORS answer at all (an opaque response) still succeeds when the server is
 * reachable, so its outcome tells the two apart.
 */
async function diagnoseFailure(
  url: string,
  doFetch: typeof fetch,
  cause: unknown,
): Promise<GyroViewError> {
  const isServerReachable = await isReachableWithoutCors(url, doFetch);
  return isServerReachable
    ? new GyroViewError(
        'cors',
        `${url} answered, but its server does not allow this page's origin to read it; add CORS headers (Access-Control-Allow-Origin, Access-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges)`,
        { cause },
      )
    : new GyroViewError(
        'source-unreadable',
        `${url} could not be fetched; check the URL and the network`,
        { cause },
      );
}

async function isReachableWithoutCors(url: string, doFetch: typeof fetch): Promise<boolean> {
  try {
    const probe = await doFetch(url, { method: 'HEAD', mode: 'no-cors' });
    discardBody(probe);
    return true;
  } catch {
    return false;
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
