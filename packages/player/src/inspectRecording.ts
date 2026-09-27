import { inspectRecording as inspectSource, type RecordingInspection } from '@gyroview/core';

import { browserSources, type BrowserPortsOptions } from './composition/browserPorts';
import type { MediaInput } from './PlayerSource';

export interface InspectOptions extends Pick<BrowserPortsOptions, 'http'> {
  /**
   * Abandons the requests for a URL; the inspection then rejects.
   */
  readonly signal?: AbortSignal;
}

/**
 * Reads what a recording's file holds without playing it (see `RecordingInspection`): from a URL,
 * in byte ranges as playback reads it, or from a `Blob`, such as a `File` from a picker. Rejects
 * with the `GyroViewError` a load would meet, for example `cors` or `invalid-trailer`.
 */
export function inspectRecording(
  recording: Blob | string,
  options: InspectOptions = {},
): Promise<RecordingInspection> {
  const signal = options.signal ?? new AbortController().signal;
  const source = browserSources(options.http ?? {}).open(inputOf(recording), signal);
  return inspectSource(source);
}

function inputOf(recording: Blob | string): MediaInput {
  return typeof recording === 'string'
    ? { url: recording }
    : { blob: recording, name: recording instanceof File ? recording.name : '' };
}
