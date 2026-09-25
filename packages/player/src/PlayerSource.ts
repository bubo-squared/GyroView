/**
 * A recording reachable over HTTP with Range support (see README, "Serving recordings").
 */
export interface UrlInput {
  readonly url: string;
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
 * Which rendition to play: `auto` plays the recording and falls back to its proxy when this
 * browser cannot decode it, `full` never falls back, `proxy` prefers the proxy when there is one.
 */
export type Quality = 'auto' | 'full' | 'proxy';

export const QUALITIES: readonly Quality[] = ['auto', 'full', 'proxy'];
export const DEFAULT_QUALITY: Quality = 'auto';

/**
 * Everything that names what to play. The second input is the other lens's file of a
 * split-file recording; the proxy is the camera's low-resolution rendition.
 */
export interface PlayerSource {
  readonly main: MediaInput;
  readonly second: MediaInput | undefined;
  readonly proxy: MediaInput | undefined;
  /**
   * Look for the camera's proxy beside a URL when none is given. Never applies to blobs.
   */
  readonly shouldDiscoverProxy: boolean;
  readonly quality: Quality;
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

/**
 * Relative URLs resolve against a placeholder so the last segment can still be read.
 */
const PLACEHOLDER_BASE = 'https://gyro-view.invalid/';

function fileNameOfUrl(url: string): string {
  const { pathname } = new URL(url, PLACEHOLDER_BASE);
  const encoded = pathname.slice(pathname.lastIndexOf('/') + 1);
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}
