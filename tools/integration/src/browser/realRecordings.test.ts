import { readPixels } from '@gyroview/adapter-three/testing';
import { waitFor } from '@gyroview/player/testing';
import {
  DecodePipeline,
  PlaybackSession,
  seconds,
  StabilizingFrameSink,
  stabilizerFor,
  type StabilizationMode,
  type Vector3,
} from '@gyroview/core';
import { FakeFrameSink } from '@gyroview/core/testing';
import {
  DECODE_PIPELINE_OPTIONS,
  PAIR_QUEUE_CAPACITY,
  type OpenedRecording,
} from '@gyroview/player/composition';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { drawAndSaveRender, saveMeasurement, saveRender } from './artifacts';
import { coverageOf, measureCentre, rigidRotationError } from './pictureChecks';
import { expectPictureFollowsSound, openAudioClock, startTicking } from './playbackChecks';
import {
  closeAll,
  DECODE_TIMEOUT_MS,
  expectLockstep,
  port,
  takePairs,
  timingOf,
} from './realRecordingSupport';
import {
  equirectangularRendering,
  lockOf,
  motionOf,
  recordedSetupOf,
  type EquirectangularRendering,
} from './rendering';
import { LOCAL_SAMPLES } from './localSamples';
import { KRNJACA_8K_30, OFFICE_5K7_60, OFFICE_PROXY, SAILING_8K_30 } from './sampleUrls';
import { SharedSample } from './SharedSample';
import { worldMovement } from './worldMovement';

const PRESENTATIONS_BEFORE_SEEK = 30;
const SEEK_TARGET = seconds(120);
const TIMESTAMP_TOLERANCE = 1e-3;

const PANORAMA_SIZE = { width: 1536, height: 768 };
/**
 * The moment every picture test renders, in seconds: well into both recordings, the camera
 * moving.
 */
const MOMENT = 100;
/**
 * The two 200-degree lenses cover the sphere; the few unlit pixels are the black beyond the
 * image circles' corners and dark scene content, not stitching holes.
 */
const MIN_COVERAGE = 0.97;
const UNITY_GAIN: Vector3 = [1, 1, 1];
const SILENCED: Vector3 = [0, 0, 0];
/**
 * How far, as a fraction of the lens frame's width, the image circle's centre may lie from
 * where the calibration's principal point lands on the frame. Lens decentring and the halo
 * along the rim account for up to about 0.75 % on the sailing frames.
 */
const MAX_CENTRE_OFFSET_FRACTION = 0.01;
const COMPARED_MODES: readonly StabilizationMode[] = ['off', 'lock'];
/**
 * Mean colour difference (0-255) tolerated between the unstabilized render and the lock render
 * resampled through the orientation: bilinear sampling noise, not a rotation error.
 */
const MAX_RIGID_ROTATION_ERROR = 20;
/**
 * A moment of the sailing recording where the boat rolls: lock halves how much the world moves
 * between pairs half a second apart (13.6 against 28.1 under `off`, in colour difference). `off`
 * is drawn as the player draws it, upright by the mounting: the movement weighs every pixel of
 * the equirectangular picture alike, and a picture on its side would be measured otherwise.
 */
const STILLNESS_MOMENT = 135;
/**
 * The most the world may move under lock, as a fraction of its movement unstabilized. A wrong
 * IMU frame or rotation convention moves it about as much as leaving the picture alone (ADR 0009).
 */
const MAX_LOCKED_MOVEMENT = 0.75;

/**
 * Each recording is opened once for the whole file: in the browser every test file has modules
 * of its own, and opening is most of what these tests cost.
 */
const office = new SharedSample(OFFICE_5K7_60);
const proxy = new SharedSample(OFFICE_PROXY);
const sailing = new SharedSample(SAILING_8K_30);
const krnjaca = new SharedSample(KRNJACA_8K_30);
/**
 * The recordings only this machine has (ADR 0031), each at the moment the catalogue renders.
 */
const locals = LOCAL_SAMPLES.map(
  (local) => [local.slug, new SharedSample(local), local.renderMoment] as const,
);
const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0).toReversed()) cleanup();
});

afterAll(() => {
  for (const shared of [office, proxy, sailing, krnjaca]) shared.dispose();
  for (const [, shared] of locals) shared.dispose();
});

/**
 * A panorama renderer for the sample, disposed after the test.
 */
function panoramaOf(opened: OpenedRecording): EquirectangularRendering {
  const rendering = equirectangularRendering(opened, PANORAMA_SIZE);
  cleanups.push(() => {
    rendering.dispose();
  });
  return rendering;
}

describe('playing the real X5 recordings in the browser', () => {
  it('reads the office recording over HTTP ranges and decodes both lenses in lockstep from a mid-file time', async (context) => {
    const opened = await office.open(context);
    expect(opened.recording.info.model).toBe('Insta360 X5');
    expect(opened.frameSources).toHaveLength(2);

    const { timings } = await office.momentAt(context, MOMENT);
    const first = timings[0]?.timestamp ?? NaN;
    expect(first).toBeLessThanOrEqual(MOMENT + TIMESTAMP_TOLERANCE);
    expect(first).toBeGreaterThan(MOMENT - 1 / OFFICE_5K7_60.frameRate);
    expectLockstep(timings, OFFICE_5K7_60);
  });

  it('plays the office recording through the session in step with its own audio and follows a seek', async (context) => {
    const opened = await office.open(context);
    const clock = await openAudioClock(opened, cleanups);
    const sink = new FakeFrameSink<VideoFrame>();
    const session = new PlaybackSession<VideoFrame>({
      frameSources: opened.frameSources,
      decoderPort: port,
      clock,
      sink,
      duration: opened.duration,
      pipeline: DECODE_PIPELINE_OPTIONS,
      queueCapacity: PAIR_QUEUE_CAPACITY,
    });
    cleanups.push(() => {
      session.dispose();
    });
    startTicking(session, cleanups);

    // As the pipeline does once playing starts: the downloads read ahead, the sound with them.
    opened.readAhead();
    await session.play();
    await waitFor(
      () => sink.presentations.length >= PRESENTATIONS_BEFORE_SEEK,
      'the first presentations',
      DECODE_TIMEOUT_MS,
    );
    expectPictureFollowsSound(sink, OFFICE_5K7_60);
    expect(clock.failure).toBeUndefined();

    session.seek(SEEK_TARGET);
    await waitFor(
      () => (sink.lastTimestamp ?? 0) >= SEEK_TARGET - 1 / OFFICE_5K7_60.frameRate,
      'a frame at the seek target',
      DECODE_TIMEOUT_MS,
    );
    expect(session.state).toBe('playing');
    expect(clock.currentTime).toBeGreaterThanOrEqual(SEEK_TARGET);
    expect(clock.currentTime).toBeLessThan(SEEK_TARGET + 2);
  });

  it('probes and decodes the first frames of the 8K sailing recording', async (context) => {
    const opened = await sailing.open(context);
    const pipeline = new DecodePipeline<VideoFrame>(
      opened.frameSources,
      port,
      DECODE_PIPELINE_OPTIONS,
    );
    const pairs = await takePairs(pipeline, 0, 5);
    const timings = pairs.map((pair) => timingOf(pair));
    closeAll(pairs);
    expect(timings[0]?.timestamp).toBeCloseTo(0, 3);
    expectLockstep(timings, SAILING_8K_30);
  });
});

describe('rendering the real recordings', () => {
  for (const [slug, shared] of [
    ['office', office],
    ['office-proxy', proxy],
    ['sailing', sailing],
    ['krnjaca', krnjaca],
  ] as const) {
    const { name } = shared.sample;

    it(`stitches a frame of the ${name} into an equirectangular picture without holes`, async (context) => {
      const opened = await shared.open(context);
      const { first } = await shared.momentAt(context, MOMENT);
      const { canvas, renderer } = panoramaOf(opened);
      renderer.present({ pair: first, mediaTime: first.timestamp });
      await saveRender(`${slug}-${MOMENT}s-equirect`, canvas);
      expect(coverageOf(readPixels(canvas))).toBeGreaterThan(MIN_COVERAGE);
      await drawAndSaveRender(`${slug}-${MOMENT}s-lens0`, canvas, () => {
        renderer.setLensGains([UNITY_GAIN, SILENCED]);
      });
      await drawAndSaveRender(`${slug}-${MOMENT}s-lens1`, canvas, () => {
        renderer.setLensGains([SILENCED, UNITY_GAIN]);
      });
    });

    it(`finds the image circle of each ${name} frame where the core's canvas window puts the principal point, not the sensor window (ADR 0014)`, async (context) => {
      const opened = await shared.open(context);
      const { first } = await shared.momentAt(context, MOMENT);
      const setup = recordedSetupOf(opened);
      const measurements = setup.lenses.map((lens) => measureCentre(opened, lens, first));
      await saveMeasurement(`${slug}-${MOMENT}s-image-circle`, measurements);
      for (const measured of measurements) {
        expect(measured.distanceToCanvasWindow).toBeLessThan(
          MAX_CENTRE_OFFSET_FRACTION * measured.frameWidth,
        );
        if (measured.distanceToSensorWindow !== undefined) {
          expect(measured.distanceToCanvasWindow).toBeLessThan(measured.distanceToSensorWindow);
        }
      }
    });
  }

  for (const [slug, shared, moment] of [
    ['office', office, MOMENT],
    ['sailing', sailing, MOMENT],
    ['krnjaca', krnjaca, MOMENT],
    ...locals,
  ] as const) {
    it(`turns the ${shared.sample.name} under lock by exactly the orientation the player integrated`, async (context) => {
      const opened = await shared.open(context);
      const { first } = await shared.momentAt(context, moment);
      const motion = motionOf(opened);
      if (!motion.imuFrame.isVerified) context.skip('its IMU frame is assumed, not measured');
      const { canvas, renderer } = panoramaOf(opened);
      const sink = new StabilizingFrameSink({ sink: renderer, motion, frameTimes: undefined });
      const rendered = new Map<StabilizationMode, Uint8ClampedArray>();
      for (const mode of COMPARED_MODES) {
        sink.setStabilizer(stabilizerFor(mode));
        sink.present({ pair: first, mediaTime: first.timestamp });
        rendered.set(mode, readPixels(canvas));
        await saveRender(`${slug}-${moment}s-${mode}`, canvas);
      }
      await drawAndSaveRender(`${slug}-${moment}s-horizon`, canvas, () => {
        sink.setStabilizer(stabilizerFor('horizon'));
        sink.present({ pair: first, mediaTime: first.timestamp });
      });
      const renders = {
        off: rendered.get('off') ?? new Uint8ClampedArray(),
        lock: rendered.get('lock') ?? new Uint8ClampedArray(),
        size: PANORAMA_SIZE,
      };
      const orientation = motion.orientations.orientationAt(first.timestamp);
      expect(rigidRotationError(renders, orientation)).toBeLessThan(MAX_RIGID_ROTATION_ERROR);
    });
  }

  it('keeps the world of the sailing recording stiller under lock than unstabilized', async (context) => {
    const opened = await sailing.open(context);
    const { first, later } = await sailing.momentAt(context, STILLNESS_MOMENT);
    const { canvas, renderer } = panoramaOf(opened);
    const renderable = { canvas, renderer, first, later };
    const unstabilized = worldMovement(renderable, () => motionOf(opened).mounting.toBody);
    const locked = worldMovement(renderable, (pair) => lockOf(opened, pair));
    await saveMeasurement(`sailing-${STILLNESS_MOMENT}s-stillness`, { unstabilized, locked });
    expect(locked).toBeLessThan(unstabilized * MAX_LOCKED_MOVEMENT);
  });
});
