import { hasErrorCode, lazy, locateOtherLensFile } from '@gyroview/core';

import type { OpenedRecording } from './OpenedRecording';
import type { OpenAttempt } from './OpenAttempt';
import { openInputs } from './openInputs';
import type { RecordingPorts } from './ports';
import { isUrlInput, type PlayerSource } from '../PlayerSource';

/**
 * Use case at the composition root: opens what a source names, following the data. A lone file
 * of a split-file pair fetches its sibling when the server has it. Only the recording itself
 * ever plays (ADR 0017). Aborting releases everything opened so far.
 */
export async function openRecording(
  source: PlayerSource,
  ports: RecordingPorts,
  signal: AbortSignal,
): Promise<OpenedRecording> {
  const attempt = attemptFor(source, ports, signal);
  const inputs = source.second ? [source.main, source.second] : [source.main];
  try {
    return await openInputs(inputs, attempt);
  } catch (error) {
    const { findSecondFile } = attempt;
    if (!findSecondFile || !hasErrorCode(error, 'missing-second-file')) throw error;
    const second = await findSecondFile();
    signal.throwIfAborted();
    if (!second) throw error;
    return openInputs([source.main, { url: second }], attempt);
  }
}

/**
 * How the source is opened: a lone file named by URL may have its other lens file beside it.
 */
function attemptFor(source: PlayerSource, ports: RecordingPorts, signal: AbortSignal): OpenAttempt {
  const { main } = source;
  return source.second === undefined && isUrlInput(main)
    ? {
        ports,
        signal,
        // Asked before the tracks are read and again once they fall short, the lookup would
        // otherwise ask the server twice for a file that is not there.
        findSecondFile: lazy(() => locateOtherLensFile(main.url, ports.locator)),
      }
    : { ports, signal };
}
