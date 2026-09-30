import { readPixels } from '@gyroview/adapter-three/testing';
import { DecodePipeline, FramePairQueue, seconds, type Vector3 } from '@gyroview/core';
import { waitFor } from '@gyroview/player/testing';
import {
  DECODE_PIPELINE_OPTIONS,
  PAIR_QUEUE_CAPACITY,
  type OpenedRecording,
} from '@gyroview/player/composition';
import { afterAll, describe, expect, it } from 'vitest';

import { drawAndSaveRender, saveMeasurement, saveRender } from '../browser/artifacts';
import { LOCAL_SAMPLES } from '../browser/localSamples';
import { coverageOf, measureCentre } from '../browser/pictureChecks';
import { port } from '../browser/realRecordingSupport';
import { equirectangularRendering, recordedSetupOf } from '../browser/rendering';
import { SharedSample } from '../browser/SharedSample';

const PANORAMA_SIZE = { width: 1536, height: 768 };
const MIN_COVERAGE = 0.97;
const UNITY_GAIN: Vector3 = [1, 1, 1];
const SILENCED: Vector3 = [0, 0, 0];

/**
 * Pairs decoded after the first, to time the decoders at their steady pace.
 */
const TIMED_PAIRS = 100;
const THROUGHPUT_TIMEOUT_MS = 60_000;
const MILLISECONDS_PER_SECOND = 1000;

/**
 * How many pairs a second the decoders deliver from `from`, each closed as it arrives: the
 * decoding alone, before any upload or drawing (ADR 0033's 8K50 question). Unlike `takePairs`,
 * it keeps no frame; the queue of four pairs, emptied every 20 ms, holds the reading under some
 * 200 pairs a second, so it is a lower bound of what the decoders can do.
 */
async function pairsPerSecondOf(opened: OpenedRecording, from: number): Promise<number> {
  const pipeline = new DecodePipeline<VideoFrame>(
    opened.frameSources,
    port,
    DECODE_PIPELINE_OPTIONS,
  );
  const queue = new FramePairQueue<VideoFrame>(PAIR_QUEUE_CAPACITY);
  const run = pipeline.run(seconds(from), queue);
  let taken = 0;
  let started: number | undefined;
  try {
    await waitFor(
      () => {
        for (let head = queue.peekTimestamp(); head !== undefined; head = queue.peekTimestamp()) {
          const pair = queue.takePairAt(head);
          if (!pair) break;
          for (const frame of pair.frames) frame.close();
          started ??= performance.now();
          taken += 1;
        }
        return taken > TIMED_PAIRS;
      },
      `${TIMED_PAIRS} decoded pairs`,
      THROUGHPUT_TIMEOUT_MS,
    );
    return (taken - 1) / ((performance.now() - (started ?? 0)) / MILLISECONDS_PER_SECOND);
  } finally {
    pipeline.abort();
    await run;
    queue.close();
  }
}

/**
 * The recordings only this machine has (ADR 0031), drawn and measured as the committed samples
 * are before a camera's decisions are made: its renders to look at, and where each lens's image
 * circle lies against the canvas window and the sensor window (ADR 0014), whose radius tells the
 * lens's field edge.
 */
describe.skipIf(LOCAL_SAMPLES.length === 0)('the local recordings', () => {
  for (const local of LOCAL_SAMPLES) {
    describe(`the local recording ${local.name}`, () => {
      const shared = new SharedSample(local);

      afterAll(() => {
        shared.dispose();
      });

      it(`stitches the frame at ${local.renderMoment} s into a panorama without holes`, async (context) => {
        const opened = await shared.open(context);
        const { first } = await shared.momentAt(context, local.renderMoment);
        const { canvas, renderer, dispose } = equirectangularRendering(opened, PANORAMA_SIZE);
        try {
          renderer.present({ pair: first, mediaTime: first.timestamp });
          const prefix = `${local.slug}-${local.renderMoment}s`;
          await saveRender(`${prefix}-equirect`, canvas);
          expect(coverageOf(readPixels(canvas))).toBeGreaterThan(MIN_COVERAGE);
          await drawAndSaveRender(`${prefix}-lens0`, canvas, () => {
            renderer.setLensGains([UNITY_GAIN, SILENCED]);
          });
          await drawAndSaveRender(`${prefix}-lens1`, canvas, () => {
            renderer.setLensGains([SILENCED, UNITY_GAIN]);
          });
        } finally {
          dispose();
        }
      });

      it(`measures where each lens's image circle lies at ${local.renderMoment} s`, async (context) => {
        const opened = await shared.open(context);
        const { first } = await shared.momentAt(context, local.renderMoment);
        const setup = recordedSetupOf(opened);
        const measurements = setup.lenses.map((lens) => measureCentre(opened, lens, first));
        await saveMeasurement(`${local.slug}-${local.renderMoment}s-image-circle`, measurements);
        expect(measurements).toHaveLength(setup.lenses.length);
      });

      it(`measures how many pairs a second it decodes from ${local.renderMoment} s`, async (context) => {
        const opened = await shared.open(context);
        const pairsPerSecond = await pairsPerSecondOf(opened, local.renderMoment);
        await saveMeasurement(`${local.slug}-decode-rate`, {
          pairsPerSecond,
          frameRate: local.frameRate,
        });
        expect(pairsPerSecond).toBeGreaterThan(0);
      });
    });
  }
});
