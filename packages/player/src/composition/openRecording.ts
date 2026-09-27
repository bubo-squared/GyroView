import { hasErrorCode, locateOtherLensFile } from '@gyroview/core';

import type { OpenedRecording } from './OpenedRecording';
import { openInputs, type OpenAttempt } from './openInputs';
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
  const attempt: OpenAttempt = { ports, signal };
  const inputs = source.second ? [source.main, source.second] : [source.main];
  try {
    return await openInputs(inputs, attempt);
  } catch (error) {
    const isLoneHalf = source.second === undefined && isLoneHalfFailure(error);
    if (!isLoneHalf || !isUrlInput(source.main)) throw error;
    const second = await locateOtherLensFile(source.main.url, ports.locator);
    signal.throwIfAborted();
    if (!second) throw error;
    return openInputs([source.main, { url: second }], attempt);
  }
}

/**
 * How a lone file of a split pair fails: its one track asks for the other, or, as the _10_ file
 * of an older camera, it has no trailer, which the _00_ file carries.
 */
function isLoneHalfFailure(error: unknown): boolean {
  return hasErrorCode(error, 'missing-second-file') || hasErrorCode(error, 'invalid-trailer');
}
