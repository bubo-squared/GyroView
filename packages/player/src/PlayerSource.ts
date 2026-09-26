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
 * Everything that names what to play. The second input is the other lens's file of a
 * split-file recording.
 */
export interface PlayerSource {
  readonly main: MediaInput;
  readonly second: MediaInput | undefined;
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
  const path = pathOf(url);
  const encoded = path.slice(path.lastIndexOf('/') + 1);
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

/**
 * The URL's path; one that does not parse is read as a path itself, so its name still shows and
 * the load fails on it where it is fetched.
 */
function pathOf(url: string): string {
  try {
    return new URL(url, PLACEHOLDER_BASE).pathname;
  } catch {
    return url;
  }
}
