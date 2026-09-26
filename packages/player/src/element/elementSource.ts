import {
  qualityFromAttribute,
  sourceFromAttributes,
  type AttributeReader,
  type ParsedSource,
} from './attributes';
import type { PlayerSource, Quality } from '../PlayerSource';

/**
 * Local files to play, from a picker or a drop.
 */
export interface FileSource {
  readonly main: File;
  readonly second?: File;
  readonly proxy?: File;
}

/**
 * What the element should play: the files handed to it, if any, otherwise what its attributes
 * name. Files still take the `quality` attribute into account.
 */
export function elementSourceOf(
  read: AttributeReader,
  baseUrl: string,
  files: FileSource | undefined,
): ParsedSource {
  if (!files) return sourceFromAttributes(read, baseUrl);
  const { quality, problems } = qualityFromAttribute(read);
  return { source: fileSourceOf(files, quality), problems };
}

function fileSourceOf(files: FileSource, quality: Quality): PlayerSource {
  return {
    main: { blob: files.main, name: files.main.name },
    second: files.second && { blob: files.second, name: files.second.name },
    proxy: files.proxy && { blob: files.proxy, name: files.proxy.name },
    shouldDiscoverProxy: false,
    quality,
  };
}
