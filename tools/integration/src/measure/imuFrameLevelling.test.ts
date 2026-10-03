import { imuFrameFor, OrientationTrack, stabilizerFor, type ImuFrame } from '@gyroview/core';
import { afterEach, describe, expect, it } from 'vitest';

import { saveMeasurement } from '../browser/artifacts';
import { isServed } from '../browser/sampleUrls';
import { allImuFrames, rankedNameOf } from './support/imuFrames';
import { alignToReference, type LockedRendering } from './support/referenceAlignment';
import { STUDIO_CLIPS, type ReferenceClip } from './support/referenceFrames';
import { quartilesOf } from './support/statistics';
import { openStudioFrame, type StudioMoment } from './support/studioFrame';

const CLIP_TIMEOUT_MS = 900_000;

/**
 * What remains between GyroView's horizon under one arrangement and Studio's frame once the turn
 * that best puts one on the other is found: its tilt, pitch and roll together, and the far
 * field's difference.
 */
interface Residual {
  readonly tilt: number;
  readonly cost: number;
}

interface Levelling {
  readonly name: string;
  /**
   * The medians over the frames.
   */
  readonly tilt: number;
  readonly cost: number;
  readonly residuals: readonly Residual[];
}

/**
 * Each of the 24 arrangements' orientations over the recording, integrated as the player does.
 */
async function candidatesOf(
  studio: StudioMoment,
): Promise<readonly (readonly [ImuFrame, OrientationTrack])[]> {
  const { recording } = studio.opened;
  const [gyro, clock] = await Promise.all([recording.readGyroRecord(), recording.captureClock()]);
  if (!gyro || !clock) throw new Error('the recording lacks a gyro record or a clock');
  return allImuFrames().map(
    (frame) => [frame, OrientationTrack.integrate({ gyro: gyro.track, clock, frame })] as const,
  );
}

type StudioFrame = StudioMoment & { readonly rendering: LockedRendering };

/**
 * What each arrangement leaves on one Studio frame, by name.
 */
async function residualsOn(studio: StudioFrame): Promise<readonly (readonly [string, Residual])[]> {
  const { pair } = studio.rendering;
  const candidates = await candidatesOf(studio);
  return candidates.map(([candidate, orientations]) => {
    const orientation = orientations.orientationAt(pair.timestamp);
    const horizon = stabilizerFor('horizon').nextRotation(orientation, pair.timestamp);
    const { turn, cost } = alignToReference(studio.reference, {
      ...studio.rendering,
      lock: horizon,
    });
    return [candidate.name, { tilt: Math.hypot(turn.pitch, turn.roll), cost }] as const;
  });
}

/**
 * How much more far-field difference than the best a frame may leave and still stand the picture
 * as Studio's does: a frame that puts gravity on a wrong axis leaves 1.6 to 3 times as much on the
 * recordings measured, one that turns about the right down otherwise a few percent more.
 */
const MATCHING_COST_RATIO = 1.25;

/**
 * The frames that stand the picture as Studio's does, by the tilt they leave, then the others,
 * by their far field's difference.
 */
function rankingOf(residuals: ReadonlyMap<string, readonly Residual[]>): readonly Levelling[] {
  const levellings = [...residuals].map(([name, values]) => ({
    name,
    tilt: quartilesOf(values.map((value) => value.tilt)).median,
    cost: quartilesOf(values.map((value) => value.cost)).median,
    residuals: values,
  }));
  const least = Math.min(...levellings.map((levelling) => levelling.cost));
  const isMatching = (levelling: Levelling): boolean =>
    levelling.cost <= least * MATCHING_COST_RATIO;
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
 * The IMU frame of a camera that never turns, read from how level each of the 24 arrangements
 * stands its picture against Insta360 Studio's (ADR 0009). The world-stillness ranking needs a
 * camera that turns; on a tripod every arrangement keeps the world still. Studio levels the same
 * recording by the same accelerometer, so under the camera's frame GyroView's horizon lies on
 * Studio's within what their lens poses disagree by, while any other frame reads the small tilt
 * the camera stood at into the wrong body axes, or the down into a wrong axis altogether, and the
 * turn that puts one picture on the other keeps a pitch or a roll. Ranked by the far field's
 * difference, then by the tilt, medians over the clip's compared frames; where a measured frame
 * exists, it must come first.
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
        const residuals = new Map<string, Residual[]>();
        let configured: ImuFrame | undefined;
        for (const frame of comparedFramesOf(clip)) {
          if (!(await isServed(frame.url))) context.skip(`no Studio frame at ${frame.time} s`);
          const studio = await openStudioFrame(context, { clip, frame, cleanups });
          configured = imuFrameFor(studio.opened.recording.info);
          const frameResiduals = await residualsOn(studio);
          for (const [name, residual] of frameResiduals) {
            residuals.set(name, [...(residuals.get(name) ?? []), residual]);
          }
        }
        const ranking = rankingOf(residuals);
        await saveMeasurement(`${clip.slug}-imu-frame-levelling`, ranking);
        if (configured?.isVerified) expect(ranking[0]?.name).toBe(rankedNameOf(configured));
        expect(ranking).toHaveLength(allImuFrames().length);
      },
      CLIP_TIMEOUT_MS,
    );
  });
}
