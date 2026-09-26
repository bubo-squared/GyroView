import {
  FULL_FRAME,
  LEFT_HALF,
  RIGHT_HALF,
  type LensLayout,
  type LensSource,
} from '../../stitching/LensLayout';
import type { InputDescription, VideoTrackDescription } from '../../../ports/VideoTrack';
import { RecordingFileName } from '../naming/RecordingFileName';
import { GyroViewError } from '../../../shared/errors/GyroViewError';

/**
 * Values of the info record's file-layout field (protobuf 79), per insta360-rs. Provisional:
 * observed as 2 on X5 multi-track files, 1 is documented for `_00_`/`_10_` pairs.
 */
export const FileLayoutHint = { SplitFiles: 1, MultiTrack: 2 } as const;

/**
 * Values of the info record's track-order field (protobuf 80), per insta360-rs. Provisional:
 * stream `00` is the back lens (calibration lens 0), stream `10` the screen-side lens. The X5
 * files seen so far write 1, so their first track is the screen-side lens.
 */
export const TrackOrderHint = { Track0IsStream10: 1, Track0IsStream00: 2 } as const;

const LENS_COUNT = 2;
const PACKED_ASPECT_RATIO = 2;
const ASPECT_TOLERANCE = 0.02;
const BACK_LENS_RANK = 0;
const UNNAMED_RANK = 1;
const SCREEN_LENS_RANK = 2;

export interface LayoutHints {
  readonly fileLayout: number | undefined;
  readonly trackOrder: number | undefined;
}

interface Candidate {
  readonly input: InputDescription;
  readonly inputIndex: number;
  readonly track: VideoTrackDescription;
}

/**
 * Decides how the lens images are stored from the tracks actually present, using the info
 * record only as a hint. See ADR 0004.
 */
export function detectLensLayout(
  inputs: readonly InputDescription[],
  hints: LayoutHints,
): LensLayout {
  const candidates = inputs.flatMap((input, inputIndex) =>
    input.videoTracks.map((track) => ({ input, inputIndex, track })),
  );
  if (inputs.length === 1 && areTwoMatchingSquareTracks(candidates)) {
    return multiTrack(candidates, hints);
  }
  if (inputs.length === LENS_COUNT && isOneSquareTrackPerInput(inputs, candidates)) {
    return splitFiles(inputs, candidates);
  }
  const [only] = candidates;
  if (only && candidates.length === 1 && isPacked(only.track)) return packed(only);
  throw undecidable(inputs, candidates, hints);
}

/**
 * Lens 0 is the back lens. Without a track-order hint the first track is assumed to be it, as
 * for the `_00_` file of a pair; when the hint says track 0 is stream 10 the tracks are swapped.
 */
function multiTrack(candidates: readonly Candidate[], hints: LayoutHints): LensLayout {
  const isSwapped = hints.trackOrder === TrackOrderHint.Track0IsStream10;
  const ordered = isSwapped ? candidates.toReversed() : candidates;
  const fileLayoutEvidence =
    hints.fileLayout === undefined ? [] : [`info record file layout ${hints.fileLayout}`];
  const trackOrderEvidence =
    hints.trackOrder === undefined
      ? 'no track order hint: lens 0 assumed to be track 0'
      : `info record track order ${hints.trackOrder}: lens 0 is track ${isSwapped ? 1 : 0}`;
  return {
    kind: 'multi-track',
    sources: ordered.map((candidate, lensIndex) => fullFrameSource(candidate, lensIndex)),
    evidence: ['one input with two video tracks', ...fileLayoutEvidence, trackOrderEvidence],
  };
}

function splitFiles(
  inputs: readonly InputDescription[],
  candidates: readonly Candidate[],
): LensLayout {
  const ordered = candidates.toSorted(
    (left, right) => fileRank(left.input) - fileRank(right.input),
  );
  const names = inputs.map((input) => input.name ?? '?').join(', ');
  return {
    kind: 'split-files',
    sources: ordered.map((candidate, lensIndex) => fullFrameSource(candidate, lensIndex)),
    evidence: [
      `two inputs with one video track each (${names})`,
      'lens 0 taken from the _00_ file when named',
    ],
  };
}

function packed(candidate: Candidate): LensLayout {
  const { inputIndex, track } = candidate;
  return {
    kind: 'packed',
    sources: [
      { lensIndex: 0, inputIndex, trackIndex: track.trackIndex, region: LEFT_HALF },
      { lensIndex: 1, inputIndex, trackIndex: track.trackIndex, region: RIGHT_HALF },
    ],
    evidence: [`single ${track.codedWidth}x${track.codedHeight} track with a 2:1 aspect ratio`],
  };
}

function fullFrameSource(candidate: Candidate, lensIndex: number): LensSource {
  return {
    lensIndex,
    inputIndex: candidate.inputIndex,
    trackIndex: candidate.track.trackIndex,
    region: FULL_FRAME,
  };
}

/**
 * Lens tracks are square and, in one file, identical in size.
 */
function areTwoMatchingSquareTracks(candidates: readonly Candidate[]): boolean {
  const [first, second] = candidates;
  return (
    candidates.length === LENS_COUNT &&
    first !== undefined &&
    second !== undefined &&
    isSquare(first.track) &&
    first.track.codedWidth === second.track.codedWidth &&
    first.track.codedHeight === second.track.codedHeight
  );
}

function isOneSquareTrackPerInput(
  inputs: readonly InputDescription[],
  candidates: readonly Candidate[],
): boolean {
  return (
    candidates.length === LENS_COUNT &&
    inputs.every((input) => input.videoTracks.length === 1) &&
    candidates.every((candidate) => isSquare(candidate.track))
  );
}

function isSquare(track: VideoTrackDescription): boolean {
  return track.codedWidth === track.codedHeight;
}

function isPacked(track: VideoTrackDescription): boolean {
  return Math.abs(track.codedWidth / track.codedHeight - PACKED_ASPECT_RATIO) <= ASPECT_TOLERANCE;
}

/**
 * The back lens file (`_00_`) sorts first, the screen-side lens file (`_10_`) second; unnamed or
 * unconventionally named files keep their given order.
 */
function fileRank(input: InputDescription): number {
  const name = RecordingFileName.parse(input.name ?? '');
  if (name?.isBackLens) return BACK_LENS_RANK;
  return name?.isScreenLens ? SCREEN_LENS_RANK : UNNAMED_RANK;
}

function undecidable(
  inputs: readonly InputDescription[],
  candidates: readonly Candidate[],
  hints: LayoutHints,
): GyroViewError {
  const isLoneHalfOfPair =
    inputs.length === 1 &&
    candidates.length === 1 &&
    (hints.fileLayout === FileLayoutHint.SplitFiles ||
      RecordingFileName.parse(inputs[0]?.name ?? '')?.isBackLens === true);
  if (isLoneHalfOfPair) {
    return new GyroViewError(
      'missing-second-file',
      'this recording stores one lens per file; provide the matching _10_ file as the second source',
    );
  }
  const shape = candidates
    .map((candidate) => `${candidate.track.codedWidth}x${candidate.track.codedHeight}`)
    .join(', ');
  return new GyroViewError(
    'unsupported-layout',
    `cannot map ${candidates.length} video track(s) [${shape}] in ${inputs.length} file(s) onto two lenses`,
  );
}
