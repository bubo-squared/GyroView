import { RecordingFileName } from '../../domain/format/naming/RecordingFileName';
import type { ResourceLocator } from '../../ports/ResourceLocator';

type CompanionNaming = (name: RecordingFileName) => string;

/**
 * Use case: the URL of the low-resolution proxy next to a recording, if the server has one.
 * Nothing depends on it; callers treat undefined as "play the recording itself".
 */
export function locateProxy(
  recordingUrl: string,
  locator: ResourceLocator,
): Promise<string | undefined> {
  return locateCompanion(recordingUrl, locator, (name) => name.proxyName());
}

/**
 * Use case: the URL of the other lens's file of a split-file recording, if the server has one.
 */
export function locateOtherLensFile(
  recordingUrl: string,
  locator: ResourceLocator,
): Promise<string | undefined> {
  return locateCompanion(recordingUrl, locator, (name) => name.otherLensName());
}

async function locateCompanion(
  recordingUrl: string,
  locator: ResourceLocator,
  companionNameOf: CompanionNaming,
): Promise<string | undefined> {
  const name = RecordingFileName.parse(fileNameOf(recordingUrl));
  if (!name) return undefined;
  const candidate = siblingUrl(recordingUrl, companionNameOf(name));
  return (await locator.exists(candidate)) ? candidate : undefined;
}

const QUERY_OR_FRAGMENT = /[#?]/u;

function splitUrl(url: string): { readonly path: string; readonly suffix: string } {
  const suffixStart = url.search(QUERY_OR_FRAGMENT);
  return suffixStart === -1
    ? { path: url, suffix: '' }
    : { path: url.slice(0, suffixStart), suffix: url.slice(suffixStart) };
}

/**
 * The last path segment, percent-decoded; the whole string when there is no slash.
 */
function fileNameOf(url: string): string {
  const { path } = splitUrl(url);
  const encoded = path.slice(path.lastIndexOf('/') + 1);
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

function siblingUrl(url: string, fileName: string): string {
  const { path, suffix } = splitUrl(url);
  const directory = path.slice(0, path.lastIndexOf('/') + 1);
  return `${directory}${encodeURIComponent(fileName)}${suffix}`;
}
