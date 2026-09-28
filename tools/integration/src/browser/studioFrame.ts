import type { Matrix3 } from '@gyroview/core';
import type { OpenedRecording } from '@gyroview/player/composition';
import type { TestContext } from 'vitest';

import { openSample } from './realRecordingSupport';
import type { LockedRendering } from './referenceAlignment';
import {
  loadGreyImage,
  recordingTimeOf,
  REFERENCE_PANORAMA_SIZE,
  type GreyImage,
  type ReferenceClip,
  type ReferenceFrame,
} from './referenceFrames';
import { equirectangularRendering, lockOf } from './rendering';
import { closeMoment, decodeMoment, type Moment } from './SharedSample';

/**
 * Which Studio frame to open, and where the test collects what closes it again.
 */
export interface StudioFrameRequest {
  readonly clip: ReferenceClip;
  readonly frame: ReferenceFrame;
  readonly cleanups: (() => void)[];
}

/**
 * A Studio frame, and the recording opened and decoded at its time, with the gyro's lock of the
 * moment's first pair.
 */
export interface StudioMoment {
  readonly reference: GreyImage;
  readonly opened: OpenedRecording;
  readonly moment: Moment;
  readonly lock: Matrix3;
}

export async function openStudioMoment(
  context: TestContext,
  request: StudioFrameRequest,
): Promise<StudioMoment> {
  const { clip, frame, cleanups } = request;
  const reference = await loadGreyImage(frame.url);
  const opened = await openSample(context, clip.sample);
  cleanups.push(() => {
    opened.dispose();
  });
  const moment = await decodeMoment(opened, recordingTimeOf(clip, frame));
  cleanups.push(() => {
    closeMoment(moment);
  });
  return { reference, opened, moment, lock: lockOf(opened, moment.first) };
}

/**
 * As {@link openStudioMoment}, the moment's first pair drawn as a panorama of the reference's
 * size under the lock.
 */
export async function openStudioFrame(
  context: TestContext,
  request: StudioFrameRequest,
): Promise<StudioMoment & { readonly rendering: LockedRendering }> {
  const studio = await openStudioMoment(context, request);
  const { canvas, renderer, dispose } = equirectangularRendering(
    studio.opened,
    REFERENCE_PANORAMA_SIZE,
  );
  request.cleanups.push(dispose);
  const rendering = { renderer, canvas, pair: studio.moment.first, lock: studio.lock };
  return { ...studio, rendering };
}
