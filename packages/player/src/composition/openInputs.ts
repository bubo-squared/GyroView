import {
  detectLensLayout,
  ensureInvariant,
  GyroViewError,
  lensFrameOrder,
  probeDecoding,
  readRecording,
  seconds,
  type CaptureClock,
  type DecodeProbeReport,
  type DemuxedInput,
  type FrameSourceKey,
  type Recording,
  type VideoTrackReader,
} from '@gyroview/core';

import { Disposables } from './Disposables';
import { hasErrorCode } from './errorCodes';
import { frameTimesFor } from './frameTimesFor';
import { motionSetupFor, type MotionSetup } from './motionSetupFor';
import type { OpenedRecording } from './OpenedRecording';
import type { RecordingPorts } from './ports';
import type { PlayerMetadata } from '../PlayerMetadata';
import { inputName, type MediaInput } from '../PlayerSource';

/**
 * One attempt at opening a set of inputs, with what the attempt should say about itself.
 */
export interface OpenAttempt {
  readonly ports: RecordingPorts;
  readonly signal: AbortSignal;
  readonly isProxy: boolean;
  readonly proxyName: string | undefined;
  readonly notes: readonly string[];
}

interface DemuxedRecording {
  readonly recording: Recording;
  readonly inputs: readonly DemuxedInput[];
}

interface Timing {
  readonly frameTimes: OpenedRecording['frameTimes'];
  readonly frameTimeSource: PlayerMetadata['frameTimeSource'];
  readonly motion: MotionSetup | undefined;
  readonly warnings: readonly string[];
}

const NO_CLOCK_WARNING =
  'the recording has no capture clock; frame timing and stabilization are unavailable';
const NO_FRAME_TIMES_WARNING = 'no frame timing source is usable; stabilization is unavailable';

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
    const layout = detectLensLayout(descriptionsOf(demuxed.inputs), demuxed.recording.layoutHints);
    const lensTracks = lensFrameOrder(layout).map((key) => trackAt(demuxed.inputs, key));
    const calibration = calibrationOf(demuxed.recording);
    await ensureDecodable(lensTracks, attempt);
    const timing = await timingOf(demuxed.recording, lensTracks);
    attempt.signal.throwIfAborted();
    return assemble({ demuxed, layout, lensTracks, calibration, timing, attempt }, disposables);
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
  const sources = inputs.map((input) => ports.sources.open(input));
  const [primary] = sources;
  ensureInvariant(primary !== undefined, 'a recording needs at least one input');
  const recording = await readRecording(primary);
  signal.throwIfAborted();
  const settled = await Promise.allSettled(
    sources.map((source, index) =>
      ports.demuxer.open(source, inputName(inputs[index] ?? { url: '' })),
    ),
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

function descriptionsOf(inputs: readonly DemuxedInput[]): Parameters<typeof detectLensLayout>[0] {
  return inputs.map((input) => ({
    name: input.name,
    videoTracks: input.videoTracks.map((track) => track.description),
  }));
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
  lensTracks: readonly VideoTrackReader[],
  attempt: OpenAttempt,
): Promise<void> {
  const { ports, signal } = attempt;
  const report = await probeDecoding(lensTracks, ports.decoderPort, {
    deadline: ports.probeDeadline(),
  });
  signal.throwIfAborted();
  if (report.canDecode) return;
  throw new GyroViewError(
    'codec-unsupported',
    `this browser cannot decode the recording: ${describeProbe(report)}`,
  );
}

function describeProbe(report: DecodeProbeReport): string {
  return report.lenses
    .filter((lens) => lens.verdict !== 'decodes')
    .map(
      (lens) =>
        `track ${lens.track.trackIndex} ${lens.verdict}${lens.detail ? ` (${lens.detail})` : ''}`,
    )
    .join('; ');
}

async function timingOf(
  recording: Recording,
  lensTracks: readonly VideoTrackReader[],
): Promise<Timing> {
  const clock = await captureClockOf(recording);
  const [track] = lensTracks;
  if (!clock || !track) return withoutTiming([NO_CLOCK_WARNING]);
  const [frames, motion] = await Promise.all([
    frameTimesFor(recording, track, clock),
    motionSetupFor(recording, clock),
  ]);
  return {
    frameTimes: frames?.frameTimes,
    frameTimeSource: frames?.source,
    motion: motion.setup,
    warnings: [...(frames?.warnings ?? [NO_FRAME_TIMES_WARNING]), ...motion.warnings],
  };
}

function withoutTiming(warnings: readonly string[]): Timing {
  return { frameTimes: undefined, frameTimeSource: undefined, motion: undefined, warnings };
}

/**
 * Undefined when the info record has no first-frame timestamp, the one field everything
 * time-related hangs on.
 */
async function captureClockOf(recording: Recording): Promise<CaptureClock | undefined> {
  try {
    return await recording.captureClock();
  } catch (error) {
    if (hasErrorCode(error, 'no-frame-times')) return undefined;
    throw error;
  }
}

interface AssemblyParts {
  readonly demuxed: DemuxedRecording;
  readonly layout: OpenedRecording['layout'];
  readonly lensTracks: readonly VideoTrackReader[];
  readonly calibration: OpenedRecording['calibration'];
  readonly timing: Timing;
  readonly attempt: OpenAttempt;
}

function assemble(parts: AssemblyParts, disposables: Disposables): OpenedRecording {
  const { demuxed, layout, lensTracks, calibration, timing, attempt } = parts;
  const [primary] = demuxed.inputs;
  const duration = seconds(Math.min(...demuxed.inputs.map((input) => input.duration)));
  const audioTrack = primary?.audioTracks[0];
  return {
    recording: demuxed.recording,
    layout,
    lensTracks,
    calibration,
    duration,
    frameTimes: timing.frameTimes,
    motion: timing.motion,
    audioTrack,
    metadata: metadataOf(parts, duration, audioTrack !== undefined),
    warnings: [...attempt.notes, ...timing.warnings],
    dispose: disposables.toDisposer(),
  };
}

function metadataOf(parts: AssemblyParts, duration: number, hasAudio: boolean): PlayerMetadata {
  const { info } = parts.demuxed.recording;
  const { motion } = parts.timing;
  return {
    model: info.model,
    firmware: info.firmware,
    captureMode: info.captureMode,
    layout: parts.layout.kind,
    layoutEvidence: parts.layout.evidence,
    tracks: parts.lensTracks.map((track) => track.description),
    calibrationVersion: parts.calibration.version,
    frameTimeSource: parts.timing.frameTimeSource,
    hasGyro: motion !== undefined,
    imuFrame: motion && { name: motion.imuFrame.name, isVerified: motion.imuFrame.isVerified },
    hasAudio,
    isProxy: parts.attempt.isProxy,
    proxyName: parts.attempt.proxyName,
    duration: seconds(duration),
  };
}
