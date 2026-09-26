import { sourceFromAttributes, type AttributeReader } from './attributes';
import type { PlayerSource } from '../PlayerSource';

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

function fileSourceOf(files: FileSource): PlayerSource {
  return {
    main: { blob: files.main, name: files.main.name },
    second: files.second && { blob: files.second, name: files.second.name },
  };
}
