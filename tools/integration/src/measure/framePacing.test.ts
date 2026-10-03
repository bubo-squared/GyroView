import { createBrowserPlayer, type Player } from '@gyroview/player';
import { waitFor } from '@gyroview/player/testing';
import { afterEach, describe, expect, it, type TestContext } from 'vitest';
import { commands, server } from 'vitest/browser';

import { saveMeasurement } from '../browser/artifacts';
import { LOCAL_SAMPLES } from '../browser/localSamples';
import {
  isServed,
  OFFICE_5K7_60,
  SAILING_8K_30,
  type SampleRecording,
} from '../browser/sampleUrls';
import { pacingSummaryOf } from './support/pacingSummary';
import { recordPipeline, type PipelineRecorder } from './support/pipelineRecorder';

/**
 * The canvas a page might give the player: a large embed, and a window filling a 5K display's
 * 2560 by 1440 points.
 */
const VARIANTS = [
  { name: 'embed', width: 1280, height: 720 },
  { name: 'full-screen', width: 2560, height: 1440 },
] as const;

type Variant = (typeof VARIANTS)[number];

const PLAY_SECONDS = 7;
const START_SECONDS = 0.5;
const TEST_TIMEOUT_MS = 120_000;

const SAMPLES: readonly (readonly [slug: string, sample: SampleRecording])[] = [
  ...LOCAL_SAMPLES.map((local) => [local.slug, local] as const),
  ['office', OFFICE_5K7_60],
  ['sailing', SAILING_8K_30],
];

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0).toReversed()) cleanup();
});

interface TracedEvent {
  readonly name: string;
  readonly ph: string;
  readonly args?: Record<string, unknown>;
}

/**
 * What Chrome's trace says of one frame: how it ended, and whether Chrome counts it against
 * smoothness; undefined for any other event.
 */
function frameVerdictOf(
  event: TracedEvent,
): { readonly state: string; readonly affectsSmoothness: boolean } | undefined {
  if (event.name !== 'PipelineReporter' || event.ph !== 'b') return undefined;
  const reporter = event.args?.['frame_reporter'] as Record<string, unknown> | undefined;
  const state = reporter?.['state'];
  return {
    state: typeof state === 'string' ? state : 'unknown',
    affectsSmoothness: reporter?.['affects_smoothness'] === true,
  };
}

/**
 * Chrome's verdict on its frames: how many each `PipelineReporter` slice ended as, presented,
 * dropped or with nothing to update, and how many of them Chrome counts against smoothness.
 */
function frameStatesOf(events: readonly TracedEvent[]): Record<string, number> {
  const states: Record<string, number> = {};
  const count = (key: string): void => {
    states[key] = (states[key] ?? 0) + 1;
  };
  for (const event of events) {
    const verdict = frameVerdictOf(event);
    if (!verdict) continue;
    count(verdict.state);
    if (verdict.affectsSmoothness) count('affecting smoothness');
  }
  return states;
}

interface Playing {
  readonly player: Player;
  readonly recorder: PipelineRecorder;
  readonly canvas: HTMLCanvasElement;
}

async function playerFor(
  context: TestContext,
  sample: SampleRecording,
  variant: Variant,
): Promise<Playing> {
  if (!(await isServed(sample.url))) context.skip(`${sample.name} is not available`);
  const canvas = document.createElement('canvas');
  canvas.style.width = `${variant.width}px`;
  canvas.style.height = `${variant.height}px`;
  const audio = document.createElement('audio');
  audio.muted = true;
  document.body.append(canvas, audio);
  const recorder = recordPipeline(audio, canvas);
  const player = createBrowserPlayer({ canvas, audio });
  cleanups.push(() => {
    player.dispose();
    recorder.restore();
    canvas.remove();
    audio.remove();
  });
  await player.load({ main: { url: sample.url }, second: undefined });
  player.setViewMode('normal');
  return { player, recorder, canvas };
}

async function playWindow(player: Player): Promise<void> {
  player.seek(START_SECONDS);
  await player.play();
  const end = START_SECONDS + PLAY_SECONDS;
  await waitFor(
    () => player.currentTime >= end || player.status === 'ended',
    'playback to the end of the window',
    TEST_TIMEOUT_MS,
  );
  player.pause();
}

/**
 * How a playing recording's frames are paced, recorded from outside the player and summarised
 * (`support/pacingSummary.ts`): new pairs drawn a second against the recording's rate, the
 * stalls between them, the main thread's, the uploads' and the GPU's time per pair, and how long
 * decoded pairs waited; in Chromium also Chrome's own count of presented and dropped frames,
 * its whole trace saved beside. The decoders alone are timed by `localRecordings.test.ts`; this
 * is what reaches the screen (ADR 0033's open 8K50 question). Pacing depends on the display, so
 * run it headed for conclusions: `GYROVIEW_HEADED=1 pnpm measure framePacing`.
 */
describe('frame pacing of a playing recording', () => {
  for (const [slug, sample] of SAMPLES) {
    for (const variant of VARIANTS) {
      it(
        `paces the ${sample.name}'s frames in a canvas of ${variant.name} size`,
        async (context) => {
          const { player, recorder, canvas } = await playerFor(context, sample, variant);
          const isTraced = server.browser === 'chromium';
          if (isTraced) await commands.startFrameTrace();
          await playWindow(player);
          const events = isTraced
            ? await commands.stopFrameTrace(`${slug}-frame-trace-${variant.name}.json`)
            : [];
          const summary = pacingSummaryOf({
            ticks: recorder.ticks,
            decoded: recorder.decoded,
            frameRate: sample.frameRate,
          });
          await saveMeasurement(`${slug}-frame-pacing-${variant.name}`, {
            sample: sample.name,
            variant,
            devicePixelRatio: globalThis.devicePixelRatio,
            drawingBuffer: { width: canvas.width, height: canvas.height },
            summary,
            frameStates: frameStatesOf(events),
            ticks: recorder.ticks,
            decoded: recorder.decoded,
          });
          expect(summary.pairsPerSecond).toBeGreaterThan(0);
        },
        TEST_TIMEOUT_MS,
      );
    }
  }
});
