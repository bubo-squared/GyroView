import { Player } from '@gyroview/player';
import { browserPorts, buildPipeline, NO_ATTITUDE_SENSOR } from '@gyroview/player/composition';
import { waitFor } from '@gyroview/player/testing';
import { describe, expect, it, type TestContext } from 'vitest';

import { saveMeasurement } from '../browser/artifacts';
import {
  isServed,
  OFFICE_5K7_60,
  SAILING_8K_30,
  type SampleRecording,
} from '../browser/sampleUrls';
import { pacingSummaryOf, type PacingSummary, type TickRecord } from './support/pacingSummary';
import { recordPipeline } from './support/pipelineRecorder';
import { jitter, ScriptedAttitudeSensor, type AttitudeMotion } from './support/scriptedAttitude';
import { quartilesOf, type Quartiles } from './support/statistics';

/**
 * A large embed's canvas, as `framePacing.test.ts` measures it.
 */
const CANVAS = { width: 1280, height: 720 };
const WINDOW_SECONDS = 6;
const START_SECONDS = 0.5;
const TEST_TIMEOUT_MS = 300_000;
const MILLISECONDS_PER_SECOND = 1000;

/**
 * A hand turning the phone around and up and down, shaking a little as hands do.
 */
function sweep(): AttitudeMotion {
  const shake = jitter(7);
  return (seconds) => [
    20 * seconds + 0.2 * shake(),
    10 * Math.sin((2 * Math.PI * seconds) / 5) + 0.2 * shake(),
    2 * Math.sin((2 * Math.PI * seconds) / 3) + 0.2 * shake(),
  ];
}

/**
 * A phone at rest on a table: noise well under a hundredth of a degree.
 */
function still(): AttitudeMotion {
  const noise = jitter(11);
  return () => [0.002 * noise(), 0.002 * noise(), 0.002 * noise()];
}

interface Variant {
  readonly name: string;
  readonly isPlaying: boolean;
  /**
   * The device's motion and how many readings it sends every 16 ms; none with motion look off.
   */
  readonly device?: { readonly motion: () => AttitudeMotion; readonly readingsPerInterval: number };
}

const VARIANTS: readonly Variant[] = [
  { name: 'playing, motion look off', isPlaying: true },
  {
    name: 'playing, sweep at 60',
    isPlaying: true,
    device: { motion: sweep, readingsPerInterval: 1 },
  },
  {
    name: 'playing, sweep in bursts of 4',
    isPlaying: true,
    device: { motion: sweep, readingsPerInterval: 4 },
  },
  {
    name: 'playing, still at 60',
    isPlaying: true,
    device: { motion: still, readingsPerInterval: 1 },
  },
  { name: 'paused, motion look off', isPlaying: false },
  {
    name: 'paused, sweep at 60',
    isPlaying: false,
    device: { motion: sweep, readingsPerInterval: 1 },
  },
  {
    name: 'paused, still at 60',
    isPlaying: false,
    device: { motion: still, readingsPerInterval: 1 },
  },
];

/**
 * What a variant cost: the canvas draws a second and the most in one animation frame, the
 * main thread's time in animation frames and the GPU's after them, a second, what hearing a
 * reading cost, and, playing, the recording's pacing.
 */
interface MotionLookCost {
  readonly variant: string;
  readonly animationFramesPerSecond: number;
  readonly canvasDrawsPerSecond: number;
  readonly mostCanvasDrawsInAFrame: number;
  readonly framesDrawnTwice: number;
  readonly mainThreadMsPerSecond: number;
  readonly gpuMsPerSecond: number;
  readonly readingsPerSecond: number;
  readonly readingMs: Quartiles;
  readonly pacing: PacingSummary | undefined;
}

/**
 * The animation frames of the ticks, each the sum of the callbacks run in it: the player's tick
 * and the renderer's scheduled draw share a frame time.
 */
function framesOf(ticks: readonly TickRecord[]): Map<number, TickRecord[]> {
  const frames = new Map<number, TickRecord[]>();
  for (const tick of ticks)
    frames.set(tick.frameTime, [...(frames.get(tick.frameTime) ?? []), tick]);
  return frames;
}

function sumOf(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function costOf(
  variant: Variant,
  ticks: readonly TickRecord[],
  sensor: ScriptedAttitudeSensor | undefined,
): Omit<MotionLookCost, 'pacing'> {
  const frames = [...framesOf(ticks).values()];
  const times = [...framesOf(ticks).keys()];
  const seconds = ((times.at(-1) ?? 0) - (times[0] ?? 0)) / MILLISECONDS_PER_SECOND;
  const drawsPerFrame = frames.map((frame) => sumOf(frame.map((tick) => tick.canvasDraws)));
  const gpuMs = ticks
    .filter((tick) => tick.canvasDraws > 0 && tick.gpuDoneAt !== undefined)
    .map((tick) => (tick.gpuDoneAt ?? tick.end) - tick.end);
  const readings = sensor?.readingMs ?? [];
  return {
    variant: variant.name,
    animationFramesPerSecond: frames.length / seconds,
    canvasDrawsPerSecond: sumOf(drawsPerFrame) / seconds,
    mostCanvasDrawsInAFrame: Math.max(0, ...drawsPerFrame),
    framesDrawnTwice: drawsPerFrame.filter((draws) => draws > 1).length,
    mainThreadMsPerSecond: sumOf(ticks.map((tick) => tick.end - tick.start)) / seconds,
    gpuMsPerSecond: sumOf(gpuMs) / seconds,
    readingsPerSecond: readings.length / seconds,
    readingMs: quartilesOf(readings),
  };
}

function sensorOf(variant: Variant): ScriptedAttitudeSensor | undefined {
  const { device } = variant;
  return device && new ScriptedAttitudeSensor(device.motion(), device.readingsPerInterval);
}

/**
 * A player on a canvas of an embed's size, recorded, with the device the variant scripts.
 */
function playerFor(sensor: ScriptedAttitudeSensor | undefined): {
  readonly player: Player;
  readonly ticks: readonly TickRecord[];
  readonly decoded: ReturnType<typeof recordPipeline>['decoded'];
  readonly dispose: () => void;
} {
  const canvas = document.createElement('canvas');
  canvas.style.width = `${CANVAS.width}px`;
  canvas.style.height = `${CANVAS.height}px`;
  const audio = document.createElement('audio');
  audio.muted = true;
  document.body.append(canvas, audio);
  const recorder = recordPipeline(audio, canvas);
  const attitude = sensor ?? NO_ATTITUDE_SENSOR;
  const player = new Player({
    host: { canvas, audio },
    ports: browserPorts(),
    pipelines: buildPipeline,
    attitude,
  });
  const dispose = (): void => {
    player.dispose();
    recorder.restore();
    canvas.remove();
    audio.remove();
  };
  return { player, ticks: recorder.ticks, decoded: recorder.decoded, dispose };
}

/**
 * One variant on a player of its own, gone before the next starts: one still playing, or still
 * hearing its device, would draw into the next one's frames.
 */
async function measure(sample: SampleRecording, variant: Variant): Promise<MotionLookCost> {
  const sensor = sensorOf(variant);
  const { player, ticks, decoded, dispose } = playerFor(sensor);
  try {
    return await measureOn(player, { sample, variant, ticks, decoded, sensor });
  } finally {
    dispose();
  }
}

interface Measured {
  readonly sample: SampleRecording;
  readonly variant: Variant;
  readonly ticks: readonly TickRecord[];
  readonly decoded: ReturnType<typeof recordPipeline>['decoded'];
  readonly sensor: ScriptedAttitudeSensor | undefined;
}

async function measureOn(player: Player, measured: Measured): Promise<MotionLookCost> {
  const { sample, variant, ticks, decoded, sensor } = measured;
  player.setViewMode('normal');
  if (sensor) expect(await player.startMotionLook()).toBe('on');
  await player.load({ main: { url: sample.url }, second: undefined });
  player.seek(START_SECONDS);
  const from = ticks.length;
  sensor?.readingMs.splice(0);
  await (variant.isPlaying ? playWindow(player) : pauseWindow());
  const window = ticks.slice(from);
  const pacing = variant.isPlaying
    ? pacingSummaryOf({ ticks: window, decoded, frameRate: sample.frameRate })
    : undefined;
  return { ...costOf(variant, window, sensor), pacing };
}

async function playWindow(player: Player): Promise<void> {
  await player.play();
  const end = START_SECONDS + WINDOW_SECONDS;
  await waitFor(
    () => player.currentTime >= end || player.status === 'ended',
    'playback to the end of the window',
    TEST_TIMEOUT_MS,
  );
  player.pause();
}

function pauseWindow(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, WINDOW_SECONDS * MILLISECONDS_PER_SECOND);
  });
}

/**
 * What motion look costs a playing and a paused recording (ADR 0040): the stitch is drawn once
 * an animation frame at most however fast the device reports (ADR 0035), a phone at rest draws
 * no more than with motion look off, and the recording keeps its pace. Run it with
 * `pnpm measure motionLookPacing`; the results go to `.artifacts/`.
 */
function costNamed(costs: readonly MotionLookCost[], name: string): MotionLookCost | undefined {
  return costs.find((cost) => cost.variant === name);
}

/**
 * At most one stitch an animation frame in every variant, and a phone at rest drawing no more
 * than motion look off.
 */
function expectWithinBounds(costs: readonly MotionLookCost[]): void {
  for (const cost of costs) expect(cost.mostCanvasDrawsInAFrame).toBeLessThanOrEqual(1);
  const pausedOff = costNamed(costs, 'paused, motion look off')?.canvasDrawsPerSecond ?? 0;
  const pausedStill = costNamed(costs, 'paused, still at 60')?.canvasDrawsPerSecond;
  expect(pausedStill).toBeLessThanOrEqual(pausedOff + 1);
}

const SAMPLES: readonly (readonly [slug: string, sample: SampleRecording])[] = [
  ['sailing', SAILING_8K_30],
  ['office', OFFICE_5K7_60],
];

describe('what motion look costs', () => {
  for (const [slug, sample] of SAMPLES) {
    it(
      `costs the ${sample.name} no more than a stitch an animation frame`,
      async (context: TestContext) => {
        if (!(await isServed(sample.url))) context.skip(`${sample.name} is not available`);
        const costs: MotionLookCost[] = [];
        for (const variant of VARIANTS) costs.push(await measure(sample, variant));
        await saveMeasurement(`motion-look-${slug}`, costs);
        expectWithinBounds(costs);
      },
      TEST_TIMEOUT_MS,
    );
  }
});
