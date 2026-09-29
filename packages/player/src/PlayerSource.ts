import { fileNameOfUrl } from '@gyroview/core';

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
