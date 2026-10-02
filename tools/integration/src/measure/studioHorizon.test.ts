import { afterEach, describe, expect, it } from 'vitest';

import { saveMeasurement, saveRender } from '../browser/artifacts';
import { horizonAt } from '../browser/rendering';
import { isServed } from '../browser/sampleUrls';
import {
  alignToReference,
  NO_TURN,
  renderUnder,
  type ViewTurn,
} from './support/referenceAlignment';
import { greyCanvasOf, STUDIO_CLIPS } from './support/referenceFrames';
import { quartilesOf, type Quartiles } from './support/statistics';
import { openStudioFrame } from './support/studioFrame';

const FRAME_TIMEOUT_MS = 120_000;
const AXES: readonly (keyof ViewTurn)[] = ['yaw', 'pitch', 'roll'];

/**
 * How Insta360 Studio's export of a recording faces and levels, against GyroView's horizon mode
 * at the same moment: the view turn that puts GyroView's panorama on each Studio frame. Studio's
 * export levels the horizon and follows the camera's heading, as horizon mode does, so a turn
 * near zero says both stand the recording alike; a steady yaw says Studio centres another body
 * direction, a pitch or roll that one of them stands the picture tilted (ADR 0038). Each frame's
 * render is saved beside Studio's for the eye.
 */
for (const clip of STUDIO_CLIPS) {
  describe(`the horizon against the Studio export of ${clip.sample.name}`, () => {
    const cleanups: (() => void)[] = [];
    const turns: ViewTurn[] = [];

    afterEach(() => {
      for (const cleanup of cleanups.splice(0).toReversed()) cleanup();
    });

    for (const frame of clip.frames) {
      it(
        `turns GyroView's horizon onto the Studio frame at ${frame.time} s`,
        async (context) => {
          if (!(await isServed(frame.url))) context.skip(`no Studio frame at ${frame.time} s`);
          const studio = await openStudioFrame(context, { clip, frame, cleanups });
          const { pair } = studio.rendering;
          const rendering = { ...studio.rendering, lock: horizonAt(studio.opened, pair.timestamp) };
          const alignment = alignToReference(studio.reference, rendering);
          turns.push(alignment.turn);
          const prefix = `${clip.slug}-${frame.time}s-studio-horizon`;
          await saveRender(prefix, greyCanvasOf(renderUnder(rendering, NO_TURN)));
          await saveRender(`${prefix}-reference`, greyCanvasOf(studio.reference));
          await saveMeasurement(prefix, alignment);
          expect(Number.isFinite(alignment.cost)).toBe(true);
        },
        FRAME_TIMEOUT_MS,
      );
    }

    it('summarises the turns over the frames', async (context) => {
      if (turns.length === 0) context.skip('no frame was aligned');
      const summary = Object.fromEntries(
        AXES.map((axis) => [axis, quartilesOf(turns.map((turn) => turn[axis]))]),
      ) as Record<keyof ViewTurn, Quartiles>;
      await saveMeasurement(`${clip.slug}-studio-horizon`, { summary, turns });
      expect(Number.isFinite(summary.yaw.median)).toBe(true);
    });
  });
}
