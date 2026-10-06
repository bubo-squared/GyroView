import {
  readRecordingFiles,
  type ByteStream,
  type RecordingFile,
  type RecordingFiles,
} from '@gyroview/core';

import type { OpenAttempt } from './OpenAttempt';
import { inputName, type MediaInput } from '../PlayerSource';

/**
 * One input of a recording as the core reads it, with the stream its download reads while it
 * plays (ADR 0029): both read one file, so they know one size and one version.
 */
export interface InputFile extends RecordingFile {
  readonly stream: ByteStream;
}

/**
 * Opens the given inputs through the ports and reads them as one recording; the other lens file
 * of a lone one is opened as the lone one is, with the same signal and credentials.
 */
export function readInputs(
  inputs: readonly MediaInput[],
  attempt: OpenAttempt,
): Promise<RecordingFiles<InputFile>> {
  const { ports, signal, findSecondFile } = attempt;
  const fileOf = (input: MediaInput): InputFile => ({
    name: inputName(input),
    ...ports.sources.open(input, signal),
  });
  return readRecordingFiles(
    inputs.map((input) => fileOf(input)),
    {
      codecReader: ports.codecReader,
      findSecondFile:
        findSecondFile &&
        (async (): Promise<InputFile | undefined> => {
          signal.throwIfAborted();
          const input = await findSecondFile();
          signal.throwIfAborted();
          return input && fileOf(input);
        }),
    },
  );
}
