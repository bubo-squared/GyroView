import { sourceFromAttributes, type AttributeReader } from './attributes';
import {
  isUrlInput,
  type MediaInput,
  type PlayerSource,
  type RecordingFetch,
} from '../PlayerSource';

/**
 * Local files to play, from a picker or a drop.
 */
export interface FileSource {
  readonly main: File;
  readonly second?: File;
}

/**
 * What the element should play: the files handed to it, if any, otherwise what its attributes
 * name.
 */
export function elementSourceOf(
  read: AttributeReader,
  baseUrl: string,
  files: FileSource | undefined,
): PlayerSource | undefined {
  return files ? fileSourceOf(files) : sourceFromAttributes(read, baseUrl);
}

/**
 * The source with the page's `fetch` on each input read over HTTP, so that every request for the
 * recording goes through it; local files are not fetched. Without one, the source as it is.
 */
export function readThrough(source: PlayerSource, fetch: RecordingFetch | null): PlayerSource {
  if (fetch === null) return source;
  const withFetch = (input: MediaInput): MediaInput =>
    isUrlInput(input) ? { ...input, fetch } : input;
  return { main: withFetch(source.main), second: source.second && withFetch(source.second) };
}

function fileSourceOf(files: FileSource): PlayerSource {
  return {
    main: { blob: files.main, name: files.main.name },
    second: files.second && { blob: files.second, name: files.second.name },
  };
}
