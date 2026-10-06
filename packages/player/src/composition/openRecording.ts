import { locateOtherLensFile } from '@gyroview/core';

import type { OpenedRecording } from './OpenedRecording';
import type { OpenAttempt } from './OpenAttempt';
import { openInputs } from './openInputs';
import type { RecordingPorts } from './ports';
import { isUrlInput, type PlayerSource, type UrlInput } from '../PlayerSource';

/**
 * Use case at the composition root: opens what a source names, following the data. A lone file
 * named by URL has its other lens file looked for beside it, which the core asks for when the
 * recording turns out split. Only the recording itself ever plays (ADR 0017). Aborting releases
 * everything opened so far.
 */
export function openRecording(
  source: PlayerSource,
  ports: RecordingPorts,
  signal: AbortSignal,
): Promise<OpenedRecording> {
  const inputs = source.second ? [source.main, source.second] : [source.main];
  return openInputs(inputs, attemptFor(source, ports, signal));
}

/**
 * How the source is opened: a lone file named by URL may have its other lens file beside it.
 */
function attemptFor(source: PlayerSource, ports: RecordingPorts, signal: AbortSignal): OpenAttempt {
  const { main } = source;
  return source.second === undefined && isUrlInput(main)
    ? { ports, signal, findSecondFile: () => otherLensFileOf(main, ports) }
    : { ports, signal };
}

/**
 * The other lens file beside a lone one, when the server has it: one recording, so it is read
 * as the lone file is, with the same credentials.
 */
async function otherLensFileOf(
  main: UrlInput,
  ports: RecordingPorts,
): Promise<UrlInput | undefined> {
  const url = await locateOtherLensFile(main.url, ports.locatorFor(main));
  return url === undefined ? undefined : { ...main, url };
}
