import { GyroViewError } from '@gyroview/core';

export type HttpMethod = 'GET' | 'HEAD';

/**
 * The Range header value that asks for the first byte only: enough to learn whether a resource
 * is there, or its total size from Content-Range.
 */
export const FIRST_BYTE_RANGE = 'bytes=0-0';

/**
 * The response headers a cross-origin page must be let read, as the fix a CORS failure names.
 */
export const EXPOSED_HEADERS_ADVICE =
  'Access-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges';

export interface HttpRequestOptions {
  /**
   * Extra request settings, for example credentials or headers. `Range` is set by the caller.
   * Requests bypass the browser's HTTP cache unless these settings choose another `cache` mode.
   */
  readonly requestInit?: RequestInit;
  readonly fetch?: typeof fetch;
}

interface HttpRequest {
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
 * One request with the shared settings merged in, failures explained: a request that fails
 * outright is told apart from one the browser blocked for want of CORS headers (the latter is
 * `cors`, the former `source-unreadable`). A caller's abort is passed on as it is.
 */
export async function httpRequest(
  url: string,
  request: HttpRequest,
  options: HttpRequestOptions,
): Promise<Response> {
  try {
    return await plainHttpRequest(url, request, options);
  } catch (error) {
    if (isAbort(error)) throw error;
    throw await diagnoseFailure(url, options, error);
  }
}

/**
 * One request with the shared settings merged in and its failure left as the platform reported
 * it, for callers to whom any failure means the same.
 */
export function plainHttpRequest(
  url: string,
  request: HttpRequest,
  options: HttpRequestOptions,
): Promise<Response> {
  const doFetch = options.fetch ?? fetch;
  return doFetch(url, {
    cache: CACHE_MODE,
    ...options.requestInit,
    method: request.method,
    headers: { ...headersOf(options.requestInit), ...request.headers },
  });
}

/**
 * The options with `signal` ending their requests too, beside any signal the host gave: made once
 * per source, so the listeners it adds do not pile up per request.
 */
export function withAbortSignal(
  options: HttpRequestOptions,
  signal: AbortSignal,
): HttpRequestOptions {
  const hostSignal = options.requestInit?.signal ?? undefined;
  const either = hostSignal ? eitherSignal(hostSignal, signal) : signal;
  return { ...options, requestInit: { ...options.requestInit, signal: either } };
}

/**
 * Fires when either does. `AbortSignal.any` would do, but iOS Safari has it only from 17.4.
 * Whichever fires takes both listeners along, so a long-lived host signal keeps none.
 */
function eitherSignal(first: AbortSignal, second: AbortSignal): AbortSignal {
  const controller = new AbortController();
  for (const signal of [first, second]) {
    if (signal.aborted) controller.abort(signal.reason);
    signal.addEventListener(
      'abort',
      () => {
        controller.abort(signal.reason);
      },
      { once: true, signal: controller.signal },
    );
  }
  return controller.signal;
}

/**
 * A caller's abort, passed on as it is.
 */
export function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/**
 * Browsers report a CORS refusal and a network failure alike, as a rejected fetch. A request
 * that asks for no CORS answer at all (an opaque response) still succeeds when the server is
 * reachable, so its outcome tells the two apart.
 */
async function diagnoseFailure(
  url: string,
  options: HttpRequestOptions,
  cause: unknown,
): Promise<GyroViewError> {
  const isServerReachable = await isReachableWithoutCors(url, options);
  return isServerReachable
    ? new GyroViewError(
        'cors',
        `${url} answered, but its server does not allow this page's origin to read it; add CORS headers (Access-Control-Allow-Origin, ${EXPOSED_HEADERS_ADVICE})`,
        { cause },
      )
    : new GyroViewError(
        'source-unreadable',
        `${url} could not be fetched; check the URL and the network`,
        { cause },
      );
}

/**
 * The probe ends with the request it diagnoses: an abort of the load ends it too.
 */
async function isReachableWithoutCors(url: string, options: HttpRequestOptions): Promise<boolean> {
  const doFetch = options.fetch ?? fetch;
  const signal = options.requestInit?.signal ?? null;
  try {
    const probe = await doFetch(url, { method: 'HEAD', mode: 'no-cors', signal });
    discardBody(probe);
    return true;
  } catch (error) {
    if (isAbort(error)) throw error;
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
