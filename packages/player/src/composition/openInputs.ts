import {
  detectLensLayout,
  downloadPolicyFor,
  ensureInvariant,
  GyroViewError,
  lensFrameOrder,
  seconds,
  startFileDownload,
  timeRecording,
  type AudioPackager,
  type AudioSegmentSource,
  type AudioTrackReader,
  type DownloadedAudioTrack,
  type DownloadedFile,
  type FrameSourceKey,
  type Recording,
  type RecordingTiming,
  type Seconds,
  type VideoTrackReader,
} from '@gyroview/core';

import { Disposables } from './Disposables';
import { ensureDecodable } from './ensureDecodable';
import type { OpenAttempt } from './OpenAttempt';
import type { OpenedRecording } from './OpenedRecording';
import { describedInput, readInputs, type ReadInput, type ReadRecording } from './readInputs';
import type { PlayerMetadata } from '../PlayerMetadata';
import type { MediaInput } from '../PlayerSource';

/**
 * Opens the given inputs as one recording (ADR 0029): their sample tables and codecs read, the
 * lens layout and calibration decided, then one download a file, which the decode probe reads
 * through first. Everything opened is released again when any step fails or the attempt is
 * aborted.
 */
export async function openInputs(
  inputs: readonly MediaInput[],
  attempt: OpenAttempt,
): Promise<OpenedRecording> {
  const disposables = new Disposables();
  try {
    const read = await readInputs(inputs, attempt);
    const described = read.inputs.map((input) => describedInput(input));
    const layout = detectLensLayout(described, read.recording.info);
    const calibration = calibrationOf(read.recording);
    const files = startDownloads(read.inputs, disposables);
    const frameSources = lensFrameOrder(layout).map((key) => trackAt(files, key));
    await ensureDecodable(frameSources, attempt);
    const timing = await timeRecording(read.recording, frameSources[0]);
    attempt.signal.throwIfAborted();
    const parts = { read, files, layout, frameSources, calibration, timing };
    return assemble(parts, attempt.ports.audioPackager, disposables);
  } catch (error) {
    disposables.disposeAll();
    throw error;
  }
}

/**
 * One download a file, each with its share of the budget.
 */
function startDownloads(inputs: readonly ReadInput[], disposables: Disposables): DownloadedFile[] {
  return inputs.map(({ opened, table, codecs, size }) => {
    const policy = downloadPolicyFor({ size, duration: table.duration }, inputs.length);
    const file = startFileDownload({ table, stream: opened.stream, codecs, policy });
    disposables.add(() => {
      file.dispose();
    });
    return file;
  });
}

function trackAt(files: readonly DownloadedFile[], key: FrameSourceKey): VideoTrackReader {
  const track = files[key.inputIndex]?.videoTracks[key.trackIndex];
  ensureInvariant(
    track !== undefined,
    `the layout points at track ${key.trackIndex} of input ${key.inputIndex}, which does not exist`,
  );
  return track;
}

function calibrationOf(recording: Recording): OpenedRecording['calibration'] {
  const { calibration, warnings } = recording.calibration;
  if (calibration) return calibration;
  const detail = warnings.length > 0 ? ` (${warnings.join('; ')})` : '';
  throw new GyroViewError(
    'no-calibration',
    `the recording carries no usable lens calibration, so it cannot be stitched${detail}`,
  );
}

interface AssemblyParts {
  readonly read: ReadRecording;
  readonly files: readonly DownloadedFile[];
  readonly layout: OpenedRecording['layout'];
  readonly frameSources: readonly VideoTrackReader[];
  readonly calibration: OpenedRecording['calibration'];
  readonly timing: RecordingTiming;
}

function assemble(
  parts: AssemblyParts,
  packager: AudioPackager,
  disposables: Disposables,
): OpenedRecording {
  const { read, files, layout, frameSources, calibration, timing } = parts;
  const duration = seconds(Math.min(...files.map((file) => file.duration)));
  // Whichever file carries the sound: a split pair given either way round still plays it.
  const [sound] = files.flatMap((file) => file.audioTracks);
  return {
    recording: read.recording,
    layout,
    frameSources,
    calibration,
    duration,
    frameTimes: timing.frameTimes,
    motion: timing.motion,
    audioTrack: sound && packagedTrack(sound, packager),
    metadata: metadataOf(parts, duration, sound !== undefined),
    warnings: timing.warnings,
    readAhead: (): void => {
      for (const file of files) file.download.startReadingAhead();
    },
    dispose: disposables.toDisposer(),
  };
}

/**
 * The sound track as the platform's media pipeline takes it, packaged when it is opened.
 */
function packagedTrack(sound: DownloadedAudioTrack, packager: AudioPackager): AudioTrackReader {
  return {
    openSegments: async (): Promise<AudioSegmentSource> => {
      await Promise.resolve();
      return packager.segmentsOf(sound.samples, sound.configuration);
    },
  };
}

function metadataOf(parts: AssemblyParts, duration: Seconds, hasAudio: boolean): PlayerMetadata {
  const { info } = parts.read.recording;
  const { motion } = parts.timing;
  return {
    model: info.model,
    firmware: info.firmware,
    captureMode: info.captureMode,
    layout: parts.layout.kind,
    layoutEvidence: parts.layout.evidence,
    tracks: parts.frameSources.map((track) => track.description),
    calibrationVersion: parts.calibration.version,
    frameTimeSource: parts.timing.frameTimeSource,
    hasGyro: motion !== undefined,
    imuFrame: motion && { name: motion.imuFrame.name, isVerified: motion.imuFrame.isVerified },
    hasAudio,
    duration,
  };
}
