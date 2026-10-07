import { fileNameOfUrl } from '@gyroview/core';

/**
 * A page's own way of sending the player's requests for a recording, in place of the platform's
 * `fetch`: to add a header the server asks for, such as `Authorization` with a token read afresh
 * for each request, or to sign each request. `window.fetch` itself fits.
 *
 * It is called on its own (without `this`), for HEAD and for byte-range GET requests, with the
 * URL as a string and `init` holding `method`, `headers` (a plain object with `Range`), `cache`,
 * the `signal` that ends the request when there is one, and `credentials` when `crossorigin`
 * sets them. It must pass `init` on as given, adding only its own headers: without
 * `cache: 'no-store'` browsers may answer a range from a cache entry they hold half of (ADR
 * 0013), and without the signal a recording given up goes on downloading. It must resolve to the
 * server's `Response` itself, whose status, type and headers the player reads. After a request
 * fails, it may be called once more with `mode: 'no-cors'`, only to learn whether the server is
 * reachable; browsers send no `Authorization` header with such a request.
 */
export type RecordingFetch = (url: string, init: RequestInit) => Promise<Response>;

/**
 * A recording reachable over HTTP with Range support (see README, "Serving recordings").
 */
export interface UrlInput {
  readonly url: string;
  /**
   * Whether every request for the recording carries the visitor's cookies, in fetch's terms:
   * `include` sends them to any origin, which must then allow the page's origin by name and
   * with `Access-Control-Allow-Credentials: true`. Unset, the player's shared request settings
   * decide, and fetch's `same-origin` when they do not. The element's
   * `crossorigin="use-credentials"` sets `include`.
   */
  readonly credentials?: RequestCredentials | undefined;
  /**
   * Sends every request for the recording, its other lens's file included, in place of the
   * platform's `fetch` and of a `fetch` the player's shared request settings name. The element's
   * `fetch` property sets it.
   */
  readonly fetch?: RecordingFetch | undefined;
}

/**
 * A recording already in the browser: a `File` from a picker or a drop.
 */
export interface BlobInput {
  readonly blob: Blob;
  readonly name: string;
}

export type MediaInput = UrlInput | BlobInput;

/**
 * Everything that names what to play. The second input is the other lens's file of a
 * split-file recording, found beside the main one by itself when left out.
 */
export interface PlayerSource {
  readonly main: MediaInput;
  readonly second?: MediaInput | undefined;
}

export function isUrlInput(input: MediaInput): input is UrlInput {
  return 'url' in input;
}

/**
 * The file name the input goes by: the URL's last path segment or the blob's name. A hint for
 * layout detection and messages, never the truth about the file.
 */
export function inputName(input: MediaInput): string {
  return isUrlInput(input) ? fileNameOfUrl(input.url) : input.name;
}
