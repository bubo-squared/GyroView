import {
  detectLensLayout,
  ensureInvariant,
  GyroViewError,
  lensFrameOrder,
  probeDecoding,
  readRecording,
  seconds,
  timeRecording,
  type DecodeProbeReport,
  type DemuxedInput,
  type FrameSourceKey,
  type Recording,
  type RecordingTiming,
  type Seconds,
  type VideoTrackReader,
} from '@gyroview/core';

import { Disposables } from './Disposables';
import type { OpenedRecording } from './OpenedRecording';
import type { RecordingPorts } from './ports';
import type { PlayerMetadata } from '../PlayerMetadata';
import { inputName, type MediaInput } from '../PlayerSource';

/**
 * What opening a recording works with: the ports it reads through and the signal that aborts it.
 */
export interface OpenAttempt {
  readonly ports: RecordingPorts;
  readonly signal: AbortSignal;
}

interface DemuxedRecording {
  readonly recording: Recording;
  readonly inputs: readonly DemuxedInput[];
}

/**
 * Opens the given inputs as one recording. The first input carries the trailer. Everything
 * opened is released again when any step fails or the attempt is aborted.
 */
export async function openInputs(
  inputs: readonly MediaInput[],
  attempt: OpenAttempt,
): Promise<OpenedRecording> {
  const disposables = new Disposables();
  try {
    const demuxed = await demuxInputs(inputs, attempt, disposables);
    const layout = detectLensLayout(demuxed.inputs, demuxed.recording.info);
    const frameSources = lensFrameOrder(layout).map((key) => trackAt(demuxed.inputs, key));
    const calibration = calibrationOf(demuxed.recording);
    await ensureDecodable(frameSources, attempt);
    const timing = await timeRecording(demuxed.recording, frameSources[0]);
    attempt.signal.throwIfAborted();
    return assemble({ demuxed, layout, frameSources, calibration, timing }, disposables);
  } catch (error) {
    disposables.disposeAll();
    throw error;
  }
}

async function demuxInputs(
  inputs: readonly MediaInput[],
  attempt: OpenAttempt,
  disposables: Disposables,
): Promise<DemuxedRecording> {
  const { ports, signal } = attempt;
  const openings = inputs.map((input) => ({ input, source: ports.sources.open(input) }));
  const [primary] = openings;
  ensureInvariant(primary !== undefined, 'a recording needs at least one input');
  const recording = await readRecording(primary.source);
  signal.throwIfAborted();
  const settled = await Promise.allSettled(
    openings.map(({ input, source }) => ports.demuxer.open(source, inputName(input))),
  );
  const opened = settled.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
  for (const input of opened) {
    disposables.add(() => {
      input.dispose();
    });
  }
  const failure = settled.find((result) => result.status === 'rejected');
  if (failure) throw failure.reason;
  signal.throwIfAborted();
  return { recording, inputs: opened };
}

function trackAt(inputs: readonly DemuxedInput[], key: FrameSourceKey): VideoTrackReader {
  const track = inputs[key.inputIndex]?.videoTracks[key.trackIndex];
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

async function ensureDecodable(
  frameSources: readonly VideoTrackReader[],
  attempt: OpenAttempt,
): Promise<void> {
  const { ports, signal } = attempt;
  const report = await probeDecoding(frameSources, ports.decoderPort, ports.probeDeadline());
  signal.throwIfAborted();
  if (report.canDecode) return;
  throw new GyroViewError(
    'codec-unsupported',
    `this browser cannot decode the recording: ${describeProbe(report)}`,
  );
}

function describeProbe(report: DecodeProbeReport): string {
  return report.sources
    .filter((lens) => lens.verdict !== 'decodes')
    .map(
      (lens) =>
        `track ${lens.track.trackIndex} ${lens.verdict}${lens.detail ? ` (${lens.detail})` : ''}`,
    )
    .join('; ');
}

interface AssemblyParts {
  readonly demuxed: DemuxedRecording;
  readonly layout: OpenedRecording['layout'];
  readonly frameSources: readonly VideoTrackReader[];
  readonly calibration: OpenedRecording['calibration'];
  readonly timing: RecordingTiming;
}

function assemble(parts: AssemblyParts, disposables: Disposables): OpenedRecording {
  const { demuxed, layout, frameSources, calibration, timing } = parts;
  const [primary] = demuxed.inputs;
  const duration = seconds(Math.min(...demuxed.inputs.map((input) => input.duration)));
  const audioTrack = primary?.audioTracks[0];
  return {
    recording: demuxed.recording,
    layout,
    frameSources,
    calibration,
    duration,
    frameTimes: timing.frameTimes,
    motion: timing.motion,
    audioTrack,
    metadata: metadataOf(parts, duration, audioTrack !== undefined),
    warnings: timing.warnings,
    dispose: disposables.toDisposer(),
  };
}

function metadataOf(parts: AssemblyParts, duration: Seconds, hasAudio: boolean): PlayerMetadata {
  const { info } = parts.demuxed.recording;
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
