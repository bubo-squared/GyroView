import { readRecording } from './readRecording';
import type { Recording } from './Recording';
import { readSampleTable } from './readSampleTable';
import type { SampleTable } from '../../domain/container/SampleTable';
import type { VersionedCalibration } from '../../domain/format/calibration/CalibrationVersion';
import {
  detectLensLayout,
  type InputDescription,
  type LayoutHints,
} from '../../domain/format/layout/detectLensLayout';
import type { LensLayout } from '../../domain/stitching/LensLayout';
import { hasTrailerAtEnd } from '../../domain/format/trailer/readTrailer';
import type { CodecReader, ContainerCodecs } from '../../ports/CodecReader';
import type { RandomAccessSource } from '../../ports/RandomAccessSource';
import { ensureInvariant, GyroViewError, hasErrorCode } from '../../shared/errors/GyroViewError';
import { lazy } from '../../shared/lazy';
import { seconds, type Seconds } from '../../shared/units/time';

/**
 * One file of a recording as opening reads it: its name, a hint and what messages call it, and
 * its bytes. Callers pass their own files, which come back with what was read of them.
 */
export interface RecordingFile {
  readonly name: string | undefined;
  readonly source: RandomAccessSource;
}

/**
 * What opening reads of a file: its sample table, its tracks' codecs, its size, and whether it
 * ends with a trailer, which an older camera writes to its back lens's file alone.
 */
export interface FileContents {
  readonly table: SampleTable;
  readonly codecs: ContainerCodecs;
  readonly size: number;
  readonly hasTrailer: boolean;
}

export type ReadFile<File extends RecordingFile> = File & FileContents;

/**
 * Files read as one recording: its metadata, what was read of every file, how the lenses lie in
 * them, the calibration they are stitched with, and how long all of them play.
 */
export interface RecordingFiles<File extends RecordingFile> {
  readonly recording: Recording;
  readonly files: readonly ReadFile<File>[];
  readonly layout: LensLayout;
  readonly calibration: VersionedCalibration;
  readonly duration: Seconds;
}

export interface FileReading<File extends RecordingFile> {
  readonly codecReader: CodecReader;
  /**
   * The other lens file of a lone file, where there is one to look for (a file named by URL may
   * have it beside it); asked once at most.
   */
  readonly findSecondFile?: (() => Promise<File | undefined>) | undefined;
}

/**
 * The layout hints of a file without an info record: the tracks alone decide.
 */
const NO_HINTS: LayoutHints = { fileLayout: undefined, trackOrder: undefined };

/**
 * The recording's metadata and the file it was read from.
 */
interface TrailerCarrier {
  readonly recording: Recording;
  readonly carrier: RecordingFile;
}

/**
 * Use case: reads the given files as one recording (ADR 0029), following the data: its metadata
 * from the file that carries the trailer, every file's sample table and codecs, then the lens
 * layout (ADR 0004) and the calibration. A lone file of a split pair has its other lens file
 * looked for: before the tracks are read when its info record says so, otherwise once its tracks
 * fall short. A recording without a usable calibration is refused: it cannot be stitched.
 */
export async function readRecordingFiles<File extends RecordingFile>(
  given: readonly File[],
  reading: FileReading<File>,
): Promise<RecordingFiles<File>> {
  const findSecondFile = reading.findSecondFile && lazy(reading.findSecondFile);
  try {
    return await readGiven(given, { codecReader: reading.codecReader, findSecondFile });
  } catch (error) {
    const second = hasErrorCode(error, 'missing-second-file')
      ? await findSecondFile?.()
      : undefined;
    if (second === undefined) throw error;
    return readGiven([...given, second], { codecReader: reading.codecReader });
  }
}

async function readGiven<File extends RecordingFile>(
  given: readonly File[],
  reading: FileReading<File>,
): Promise<RecordingFiles<File>> {
  const { recording, carrier } = await readTrailerCarrier(given, reading.codecReader);
  const files = [...given, ...(await declaredSecond(given, recording, reading))];
  const read = await Promise.all(files.map((file) => readFile(file, reading.codecReader, carrier)));
  const layout = detectLensLayout(
    read.map((file) => describedFile(file)),
    recording.info,
  );
  const calibration = calibrationOf(recording);
  const duration = seconds(Math.min(...read.map((file) => file.table.duration)));
  return { recording, files: read, layout, calibration, duration };
}

/**
 * What opening reads of `file`; whether a file other than the `carrier` the trailer was read
 * from ends with one too takes a read of its last bytes.
 */
async function readFile<File extends RecordingFile>(
  file: File,
  codecReader: CodecReader,
  carrier: RecordingFile | undefined,
): Promise<ReadFile<File>> {
  const { table, movieBytes } = await readSampleTable(file.source);
  const codecs = await codecReader.read(movieBytes);
  const size = await file.source.size();
  const hasTrailer = file === carrier || (await hasTrailerAtEnd(file.source, size));
  return { ...file, table, codecs, size, hasTrailer };
}

function describedFile(file: ReadFile<RecordingFile>): InputDescription {
  const videoTracks = file.codecs.video.map(({ description }) => ({ description }));
  return { name: file.name, videoTracks, hasTrailer: file.hasTrailer };
}

/**
 * The other lens file a lone file's info record says the recording is split into, when there
 * is one: found before the lone file's tracks are read, which finding it only once they fell
 * short would read twice.
 */
async function declaredSecond<File extends RecordingFile>(
  given: readonly File[],
  recording: Recording,
  reading: FileReading<File>,
): Promise<File[]> {
  const isDeclaredSplit = given.length === 1 && recording.info.fileLayout === 'split-files';
  const second = isDeclaredSplit ? await reading.findSecondFile?.() : undefined;
  return second === undefined ? [] : [second];
}

/**
 * The recording read from the file that carries the trailer: the first, or the second when the
 * first has none, as the _10_ file of an older camera's pair, which writes it to _00_ alone, when
 * the pair is given the other way round.
 */
async function readTrailerCarrier(
  given: readonly RecordingFile[],
  codecReader: CodecReader,
): Promise<TrailerCarrier> {
  const [first, second] = given;
  ensureInvariant(first !== undefined, 'a recording needs at least one file');
  try {
    return { recording: await readRecording(first.source), carrier: first };
  } catch (error) {
    if (!hasErrorCode(error, 'invalid-trailer')) throw error;
    if (second !== undefined)
      return { recording: await readRecording(second.source), carrier: second };
    await refuseAsLoneHalf(first, codecReader);
    throw error;
  }
}

/**
 * A lone file without a trailer may be the _10_ half of an older camera's pair: its one square
 * track tells, and the refusal asks for the other file instead of calling it damaged. Anything
 * else leaves the trailer's own refusal standing.
 */
async function refuseAsLoneHalf(file: RecordingFile, codecReader: CodecReader): Promise<void> {
  let read: ReadFile<RecordingFile>;
  try {
    read = await readFile(file, codecReader, undefined);
  } catch {
    return;
  }
  try {
    detectLensLayout([describedFile(read)], NO_HINTS);
  } catch (error) {
    if (hasErrorCode(error, 'missing-second-file')) throw error;
  }
}

function calibrationOf(recording: Recording): VersionedCalibration {
  const { calibration, warnings } = recording.calibration;
  if (calibration) return calibration;
  const detail = warnings.length > 0 ? ` (${warnings.join('; ')})` : '';
  throw new GyroViewError(
    'no-calibration',
    `the recording carries no usable lens calibration, so it cannot be stitched${detail}`,
  );
}
