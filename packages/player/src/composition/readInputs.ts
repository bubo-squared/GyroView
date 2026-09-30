import {
  detectLensLayout,
  ensureInvariant,
  hasErrorCode,
  readRecording,
  readSampleTable,
  type ContainerCodecs,
  type LayoutHints,
  type RandomAccessSource,
  type Recording,
  type SampleTable,
  type VideoTrackDescription,
} from '@gyroview/core';

import type { OpenAttempt } from './OpenAttempt';
import type { OpenedSource, RecordingPorts } from './ports';
import { inputName, type MediaInput } from '../PlayerSource';

interface Opening {
  readonly input: MediaInput;
  readonly opened: OpenedSource;
}

/**
 * One input of a recording, read as far as opening it needs: its bytes both ways, its sample
 * table, its tracks' codecs and its size. Nothing of it needs letting go.
 */
export interface ReadInput extends Opening {
  readonly table: SampleTable;
  readonly codecs: ContainerCodecs;
  readonly size: number;
}

export interface ReadRecording {
  readonly recording: Recording;
  readonly inputs: readonly ReadInput[];
}

/**
 * An input as the lens layout is decided from: its name and the video tracks its codecs tell.
 */
export interface DescribedInput {
  readonly name: string | undefined;
  readonly videoTracks: readonly { readonly description: VideoTrackDescription }[];
}

/**
 * Reads the given inputs, and the other lens file an info record declares, as one recording: its
 * metadata from the input that carries the trailer, and every input's sample table and codecs.
 */
export async function readInputs(
  inputs: readonly MediaInput[],
  attempt: OpenAttempt,
): Promise<ReadRecording> {
  const { ports, signal } = attempt;
  const given = inputs.map((input) => ({ input, opened: ports.sources.open(input, signal) }));
  const recording = await readRecordingOf(given, ports);
  signal.throwIfAborted();
  const openings = [...given, ...(await declaredSecond(given, recording, attempt))];
  const read = await Promise.all(openings.map((opening) => readInput(opening, ports)));
  signal.throwIfAborted();
  return { recording, inputs: read };
}

export function describedInput(read: ReadInput): DescribedInput {
  const videoTracks = read.codecs.video.map(({ description }) => ({ description }));
  return { name: inputName(read.input), videoTracks };
}

async function readInput(opening: Opening, ports: RecordingPorts): Promise<ReadInput> {
  const { source } = opening.opened;
  const { table, movieBytes } = await readSampleTable(source);
  const codecs = await ports.codecReader.read(movieBytes);
  return { ...opening, table, codecs, size: await source.size() };
}

/**
 * The other lens file a lone file's info record says the recording is split into, when the
 * server has it: found before the lone file's tracks are read, which finding it only once they
 * fell short would read twice. A file that does not say so still gets its sibling looked for
 * once its tracks fall short (see openRecording).
 */
async function declaredSecond(
  given: readonly Opening[],
  recording: Recording,
  attempt: OpenAttempt,
): Promise<Opening[]> {
  const isDeclaredSplit = given.length === 1 && recording.info.fileLayout === 'split-files';
  if (!isDeclaredSplit || !attempt.findSecondFile) return [];
  const input = await attempt.findSecondFile();
  attempt.signal.throwIfAborted();
  return input === undefined
    ? []
    : [{ input, opened: attempt.ports.sources.open(input, attempt.signal) }];
}

/**
 * The layout hints of a file without an info record: the tracks alone decide.
 */
const NO_HINTS: LayoutHints = { fileLayout: undefined, trackOrder: undefined };

async function readRecordingOf(
  openings: readonly Opening[],
  ports: RecordingPorts,
): Promise<Recording> {
  try {
    return await readTrailerCarrier(openings.map(({ opened }) => opened.source));
  } catch (error) {
    const [only] = openings;
    const isLoneFileWithoutTrailer =
      openings.length === 1 && hasErrorCode(error, 'invalid-trailer');
    if (isLoneFileWithoutTrailer && only) await refuseAsLoneHalf(only, ports);
    throw error;
  }
}

/**
 * A file without a trailer may be the _10_ half of an older camera's pair, which writes the
 * trailer to _00_ alone: its one square track tells, and the refusal asks for the other file
 * instead of calling it damaged. Anything else leaves the trailer's own refusal standing.
 */
async function refuseAsLoneHalf(opening: Opening, ports: RecordingPorts): Promise<void> {
  let read: ReadInput;
  try {
    read = await readInput(opening, ports);
  } catch {
    return;
  }
  try {
    detectLensLayout([describedInput(read)], NO_HINTS);
  } catch (error) {
    if (hasErrorCode(error, 'missing-second-file')) throw error;
  }
}

/**
 * The recording read from the input that carries the trailer: the first, or the second when the
 * first has none, as the _10_ file of an older camera's pair, which writes it to _00_ alone,
 * when the pair is given the other way round.
 */
async function readTrailerCarrier(sources: readonly RandomAccessSource[]): Promise<Recording> {
  const [first, second] = sources;
  ensureInvariant(first !== undefined, 'a recording needs at least one input');
  try {
    return await readRecording(first);
  } catch (error) {
    if (second === undefined || !hasErrorCode(error, 'invalid-trailer')) throw error;
    return readRecording(second);
  }
}
