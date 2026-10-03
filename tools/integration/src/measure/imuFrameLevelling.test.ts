import {
  imuFrameFor,
  OrientationTrack,
  stabilizerFor,
  type CaptureClock,
  type GyroTrack,
  type ImuFrame,
  type Vector3,
} from '@gyroview/core';
import { afterEach, describe, expect, it, type TestContext } from 'vitest';

import { saveMeasurement } from '../browser/artifacts';
import { isServed } from '../browser/sampleUrls';
import { allImuFrames, rankedNameOf } from './support/imuFrames';
import {
  alignToReference,
  isAtSearchReach,
  type LockedRendering,
} from './support/referenceAlignment';
import { STUDIO_CLIPS, type ReferenceClip } from './support/referenceFrames';
import { quartilesOf } from './support/statistics';
import { openStudioFrame, type StudioMoment } from './support/studioFrame';

const CLIP_TIMEOUT_MS = 1_800_000;

/**
 * How much more far-field difference than the best a frame may leave and still stand the picture
 * as Studio's does. On the recordings measured, a frame that puts gravity on a wrong axis leaves
 * 1.6 to 10 times as much; one that turns about the right down otherwise leaves a few percent
 * more on a still camera, and 1.7 times or more on one that moves, whose motion it turns wrong.
 */
const MATCHING_COST_RATIO = 1.25;

/**
 * A still camera's frame is decided when the frame ranked first leaves less than this share of
 * the tilt the nearest wrong turn about its down would leave, the square root of two times the
 * tilt the camera stood at: a quarter turn about the down moves that tilt to the side by as much.
 */
const DECISIVE_SHARE = 0.5;

/**
 * Accelerometer magnitudes, in g, of a camera at rest, as the orientation's gravity pull takes
 * them (ADR 0009).
 */
const MIN_RESTING_G = 0.9;
const MAX_RESTING_G = 1.1;
const DEGREES_PER_RADIAN = 180 / Math.PI;

/**
 * What remains between GyroView's horizon under one arrangement and Studio's frame once the turn
 * that best puts one on the other is found: its tilt, pitch and roll together, the far field's
 * difference, and whether the search stopped at its reach rather than at a match.
 */
interface Residual {
  readonly tilt: number;
  readonly cost: number;
  readonly isAtSearchReach: boolean;
}

interface Levelling {
  readonly name: string;
  /**
   * The medians over the frames, the tilt over those whose search met the picture.
   */
  readonly tilt: number;
  readonly cost: number;
  readonly residuals: readonly Residual[];
}

type Candidates = readonly (readonly [ImuFrame, OrientationTrack])[];

/**
 * Each of the 24 arrangements' orientations over the recording. They are integrated in the body
 * frame, where the player integrates in its mounting's upright frame: the two differ by a heading
 * alone, which the alignment's yaw search takes up.
 */
function candidatesOf(gyro: GyroTrack, clock: CaptureClock): Candidates {
  return allImuFrames().map(
    (frame) => [frame, OrientationTrack.integrate({ gyro, clock, frame })] as const,
  );
}

/**
 * The tilt the camera stood at, in degrees: how far the mean of its resting accelerometer
 * readings lies from the IMU axis nearest it. Telling for a camera that stood still, which is
 * what the ranking is for.
 */
function restingTiltOf(gyro: GyroTrack): number {
  let sum: Vector3 = [0, 0, 0];
  for (let index = 0; index < gyro.length; index += 1) {
    const reading = gyro.sampleAt(index).acceleration;
    const magnitude = Math.hypot(...reading);
    if (magnitude < MIN_RESTING_G || magnitude > MAX_RESTING_G) continue;
    sum = [sum[0] + reading[0], sum[1] + reading[1], sum[2] + reading[2]];
  }
  const alongNearestAxis = Math.max(...sum.map((component) => Math.abs(component)));
  return Math.acos(alongNearestAxis / Math.hypot(...sum)) * DEGREES_PER_RADIAN;
}

type StudioFrame = StudioMoment & { readonly rendering: LockedRendering };

/**
 * What each arrangement leaves on one Studio frame, by name.
 */
function residualsOn(
  studio: StudioFrame,
  candidates: Candidates,
): readonly (readonly [string, Residual])[] {
  const { pair } = studio.rendering;
  return candidates.map(([candidate, orientations]) => {
    const orientation = orientations.orientationAt(pair.timestamp);
    const horizon = stabilizerFor('horizon').nextRotation(orientation, pair.timestamp);
    const { turn, cost } = alignToReference(studio.reference, {
      ...studio.rendering,
      lock: horizon,
    });
    const tilt = Math.hypot(turn.pitch, turn.roll);
    return [candidate.name, { tilt, cost, isAtSearchReach: isAtSearchReach(turn) }] as const;
  });
}

function levellingOf(name: string, residuals: readonly Residual[]): Levelling {
  const met = residuals.filter((residual) => !residual.isAtSearchReach);
  return {
    name,
    tilt: met.length === 0 ? Infinity : quartilesOf(met.map((value) => value.tilt)).median,
    cost: quartilesOf(residuals.map((value) => value.cost)).median,
    residuals,
  };
}

/**
 * The frames that stand the picture as Studio's does, by the tilt they leave, then the others,
 * by their far field's difference. A frame whose search stopped at its reach on every Studio
 * frame met none of them, and stands with the others.
 */
function rankingOf(residuals: ReadonlyMap<string, readonly Residual[]>): readonly Levelling[] {
  const levellings = [...residuals].map(([name, values]) => levellingOf(name, values));
  const least = Math.min(...levellings.map((levelling) => levelling.cost));
  const isMatching = (levelling: Levelling): boolean =>
    levelling.cost <= least * MATCHING_COST_RATIO && Number.isFinite(levelling.tilt);
  return [
    ...levellings
      .filter((levelling) => isMatching(levelling))
      .toSorted((left, right) => left.tilt - right.tilt),
    ...levellings
      .filter((levelling) => !isMatching(levelling))
      .toSorted((left, right) => left.cost - right.cost),
  ];
}

function comparedFramesOf(clip: ReferenceClip): ReferenceClip['frames'] {
  return clip.frames.filter((frame) => clip.comparedTimes.includes(frame.time));
}

/**
 * The recording's gyro, read once for all its Studio frames.
 */
interface Motion {
  readonly restingTilt: number;
  readonly candidates: Candidates;
}

async function motionOf(studio: StudioFrame): Promise<Motion> {
  const { recording } = studio.opened;
  const [gyro, clock] = await Promise.all([recording.readGyroRecord(), recording.captureClock()]);
  if (!gyro || !clock) throw new Error('the recording lacks a gyro record or a clock');
  return { restingTilt: restingTiltOf(gyro.track), candidates: candidatesOf(gyro.track, clock) };
}

/**
 * What the compared frames of a clip leave under every arrangement, and what the recording says
 * of the camera.
 */
interface ClipResiduals {
  readonly residuals: ReadonlyMap<string, readonly Residual[]>;
  readonly configured: ImuFrame | undefined;
  readonly restingTilt: number;
}

async function clipResidualsOf(
  context: TestContext,
  clip: ReferenceClip,
  cleanups: (() => void)[],
): Promise<ClipResiduals> {
  const residuals = new Map<string, Residual[]>();
  let configured: ImuFrame | undefined;
  let motion: Motion | undefined;
  for (const frame of comparedFramesOf(clip)) {
    if (!(await isServed(frame.url))) context.skip(`no Studio frame at ${frame.time} s`);
    const studio = await openStudioFrame(context, { clip, frame, cleanups });
    configured = imuFrameFor(studio.opened.recording.info);
    motion ??= await motionOf(studio);
    const frameResiduals = residualsOn(studio, motion.candidates);
    for (const [name, residual] of frameResiduals) {
      residuals.set(name, [...(residuals.get(name) ?? []), residual]);
    }
  }
  return { residuals, configured, restingTilt: motion?.restingTilt ?? NaN };
}

/**
 * The IMU frame of a camera that never turns, read from how level each of the 24 arrangements
 * stands its picture against Insta360 Studio's (ADR 0009). The world-stillness ranking needs a
 * camera that turns; on a tripod every arrangement keeps the world still. Studio levels the same
 * recording by the same accelerometer, so under the camera's frame GyroView's horizon lies on
 * Studio's within what their lens poses disagree by, while any other frame reads the small tilt
 * the camera stood at into the wrong body axes, or the down into a wrong axis altogether, and the
 * turn that puts one picture on the other keeps a pitch or a roll. Ranked by the far field's
 * difference, then by the tilt, medians over the clip's compared frames; where a measured frame
 * exists, it must come first. The saved ranking says whether it decides a still camera's frame.
 */
for (const clip of STUDIO_CLIPS) {
  describe(`the IMU frame levelling against the Studio export of ${clip.sample.name}`, () => {
    const cleanups: (() => void)[] = [];

    afterEach(() => {
      for (const cleanup of cleanups.splice(0).toReversed()) cleanup();
    });

    it(
      'ranks every IMU frame by the tilt it leaves against Studio',
      async (context) => {
        const { residuals, configured, restingTilt } = await clipResidualsOf(
          context,
          clip,
          cleanups,
        );
        const ranking = rankingOf(residuals);
        const nearestWrongTurnIfStill = Math.SQRT2 * restingTilt;
        const isDecisiveIfStill =
          (ranking[0]?.tilt ?? Infinity) < DECISIVE_SHARE * nearestWrongTurnIfStill;
        await saveMeasurement(`${clip.slug}-imu-frame-levelling`, {
          restingTilt,
          nearestWrongTurnIfStill,
          isDecisiveIfStill,
          ranking,
        });
        if (configured?.isVerified) expect(ranking[0]?.name).toBe(rankedNameOf(configured));
        expect(ranking).toHaveLength(allImuFrames().length);
      },
      CLIP_TIMEOUT_MS,
    );
  });
}
