import { RecordingFileName } from '../../domain/format/naming/RecordingFileName';
import type { ResourceLocator } from '../../ports/ResourceLocator';
import { fileNameOfUrl, splitUrl } from '../../shared/text/urlPath';

/**
 * Use case: the URL of the other lens's file of a split-file recording, if the server has one.
 */
export async function locateOtherLensFile(
  recordingUrl: string,
  locator: ResourceLocator,
): Promise<string | undefined> {
  const name = RecordingFileName.parse(fileNameOfUrl(recordingUrl));
  if (!name) return undefined;
  const candidate = siblingUrl(recordingUrl, name.otherLensName());
  return (await locator.exists(candidate)) ? candidate : undefined;
}

function siblingUrl(url: string, fileName: string): string {
  const { path, suffix } = splitUrl(url);
  const directory = path.slice(0, path.lastIndexOf('/') + 1);
  return `${directory}${encodeURIComponent(fileName)}${suffix}`;
}
