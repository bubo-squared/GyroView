import {
  displayConversionsOf,
  downloadPolicyFor,
  ensureInvariant,
  lensFrameOrder,
  RecordingBuffer,
  startFileDownload,
  timeRecording,
  type AudioPackager,
  type AudioSegmentSource,
  type DownloadedFile,
  type DownloadPolicy,
  type FrameSourceKey,
  type ReadFile,
  type RecordingFiles,
  type RecordingTiming,
  type Seconds,
  type VideoTrackReader,
} from '@gyroview/core';

import { Disposables } from './Disposables';
import { ensureDecodable } from './ensureDecodable';
import type { OpenAttempt } from './OpenAttempt';
import type { OpenedRecording } from './OpenedRecording';
import { readInputs, type InputFile } from './readInputs';
import type { PlayerMetadata } from '../PlayerMetadata';
import type { MediaInput } from '../PlayerSource';

/**
 * Opens the given inputs as one recording (ADR 0029): the core reads them, deciding the lens
 * layout and calibration, then one download a file starts, which the decode probe reads through
 * first. Everything opened is released again when any step fails or the attempt is aborted.
 */
export async function openInputs(
  inputs: readonly MediaInput[],
  attempt: OpenAttempt,
): Promise<OpenedRecording> {
  const disposables = new Disposables();
  try {
    const read = await readInputs(inputs, attempt);
    attempt.signal.throwIfAborted();
    const files = startDownloads(read.files, disposables);
    const frameSources = lensFrameOrder(read.layout).map((key) => trackAt(files, key));
    await ensureDecodable(frameSources, attempt);
    const timing = await timeRecording(read.recording, frameSources[0]);
    attempt.signal.throwIfAborted();
    const parts = { read, files, frameSources, timing };
    return assemble(parts, attempt.ports.audioPackager, disposables);
  } catch (error) {
    disposables.disposeAll();
    throw error;
  }
}

/**
 * One download a file, each with its share of the budget.
 */
function startDownloads(
  inputs: readonly ReadFile<InputFile>[],
  disposables: Disposables,
): DownloadedFile[] {
  return inputs.map((input) => {
    const { stream, table, codecs } = input;
    const policy = downloadPolicyOf(input, inputs.length);
    const file = startFileDownload({ table, stream, codecs, policy });
    disposables.add(() => {
      file.dispose();
    });
    return file;
  });
}

/**
 * How a file of a recording of `fileCount` files is downloaded: by its size and length, and by
 * how long its server took to answer the reads that opened it (ADR 0044).
 */
export function downloadPolicyOf(
  file: Pick<ReadFile<InputFile>, 'size' | 'table' | 'answerWait'>,
  fileCount: number,
): DownloadPolicy {
  const { size, table, answerWait } = file;
  return downloadPolicyFor(
    { size, duration: table.duration, answerWait: answerWait?.() },
    fileCount,
  );
}

function trackAt(files: readonly DownloadedFile[], key: FrameSourceKey): VideoTrackReader {
  const track = files[key.inputIndex]?.videoTracks[key.trackIndex];
  ensureInvariant(
    track !== undefined,
    `the layout points at track ${key.trackIndex} of input ${key.inputIndex}, which does not exist`,
  );
  return track;
}

interface AssemblyParts {
  readonly read: RecordingFiles<InputFile>;
  readonly files: readonly DownloadedFile[];
  readonly frameSources: readonly VideoTrackReader[];
  readonly timing: RecordingTiming;
}

function assemble(
  parts: AssemblyParts,
  packager: AudioPackager,
  disposables: Disposables,
): OpenedRecording {
  const { read, files, frameSources, timing } = parts;
  const { layout, calibration, duration } = read;
  const display = displayConversionsOf(frameSources.map((source) => source.description.colour));
  // Whichever file carries the sound: a split pair given either way round still plays it.
  const [sound] = files.flatMap((file) => file.audioTracks);
  return {
    recording: read.recording,
    layout,
    frameSources,
    calibration,
    displayConversions: display.conversions,
    duration,
    frameTimes: timing.frameTimes,
    motion: timing.motion,
    soundSegments:
      sound && ((): AudioSegmentSource => packager.segmentsOf(sound.samples, sound.configuration)),
    metadata: metadataOf(parts, duration, sound !== undefined),
    warnings: [...timing.warnings, ...display.warnings],
    readAhead: (): void => {
      for (const file of files) file.download.startReadingAhead();
    },
    buffer: new RecordingBuffer(files.map((file) => file.download)),
    dispose: disposables.toDisposer(),
  };
}

function metadataOf(parts: AssemblyParts, duration: Seconds, hasAudio: boolean): PlayerMetadata {
  const { info } = parts.read.recording;
  const { motion } = parts.timing;
  return {
    model: info.model,
    firmware: info.firmware,
    captureMode: info.captureMode,
    layout: parts.read.layout.kind,
    layoutEvidence: parts.read.layout.evidence,
    tracks: parts.frameSources.map((track) => track.description),
    calibrationVersion: parts.read.calibration.version,
    frameTimeSource: parts.timing.frameTimeSource,
    hasGyro: motion !== undefined,
    imuFrame: motion && { name: motion.imuFrame.name, isVerified: motion.imuFrame.isVerified },
    hasAudio,
    duration,
  };
}
