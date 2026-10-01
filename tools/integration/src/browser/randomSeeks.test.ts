import { createBrowserPlayer, type Player } from '@gyroview/player';
import { afterEach, describe, expect, it, type TestContext } from 'vitest';

import { LOCAL_SAMPLES } from './localSamples';
import { isServed, SAILING_8K_30, type SampleRecording } from './sampleUrls';

/**
 * Seeks and drags of the seek bar, at random but the same every run: before segments were
 * whole, a seek that stopped the sound's feed between a fragment's two halves failed playback
 * with a decode error within a few dozen of them.
 */
const STEPS = 40;
const SEED = 7;
const SCRUBS_PER_DRAG = { least: 2, most: 7 };
const DRAG_SPAN_OF_DURATION = 0.2;
const SCRUB_PAUSE_MS = { least: 20, most: 80 };
const SEEK_PAUSE_MS = { least: 50, most: 750 };
/**
 * Seeks stop short of the end, which ends playback rather than going on from there.
 */
const WITHIN_DURATION = 0.98;
const TEST_TIMEOUT_MS = 120_000;

const SAMPLES: readonly SampleRecording[] = [SAILING_8K_30, ...LOCAL_SAMPLES];

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0).toReversed()) cleanup();
});

interface Range {
  readonly least: number;
  readonly most: number;
}

const UNIT: Range = { least: 0, most: 1 };

type Random = (range: Range) => number;

/**
 * A linear congruential generator, so a failing sequence can be replayed.
 */
function randomFrom(seed: number): Random {
  let state = seed;
  return (range) => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return range.least + (state / 2_147_483_648) * (range.most - range.least);
  };
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function playingPlayer(context: TestContext, sample: SampleRecording): Promise<Player> {
  if (!(await isServed(sample.url))) context.skip(`${sample.name} is not available`);
  const canvas = document.createElement('canvas');
  const audio = document.createElement('audio');
  // Muted, as a browser plays without a gesture; the sound is decoded all the same.
  audio.muted = true;
  document.body.append(canvas, audio);
  const player = createBrowserPlayer({ canvas, audio });
  cleanups.push(() => {
    player.dispose();
    canvas.remove();
    audio.remove();
  });
  await player.load({ main: { url: sample.url }, second: undefined });
  await player.play();
  return player;
}

/**
 * A drag of the seek bar: scrubs close together around `target`, then the seek where it is let
 * go.
 */
async function drag(player: Player, target: number, random: Random): Promise<void> {
  const last = player.duration * WITHIN_DURATION;
  const scrubs = Math.floor(random(SCRUBS_PER_DRAG));
  for (let index = 0; index < scrubs; index += 1) {
    const offset = (random(UNIT) - 0.5) * player.duration * DRAG_SPAN_OF_DURATION;
    void player.scrub(Math.min(last, Math.max(0, target + offset)));
    await pause(random(SCRUB_PAUSE_MS));
  }
  player.seek(target);
}

describe('random seeks and drags of the seek bar during playback', () => {
  for (const sample of SAMPLES) {
    it(
      `plays the ${sample.name} through them without an error`,
      async (context) => {
        const player = await playingPlayer(context, sample);
        const errors: string[] = [];
        player.events.on('error', (error) => {
          errors.push(`${error.code}: ${error.message}`);
        });
        const random = randomFrom(SEED);
        for (let step = 0; step < STEPS && errors.length === 0; step += 1) {
          const isDrag = random(UNIT) < 0.5;
          const target = random(UNIT) * player.duration * WITHIN_DURATION;
          if (isDrag) await drag(player, target, random);
          else player.seek(target);
          await pause(random(SEEK_PAUSE_MS));
        }
        expect(errors).toEqual([]);
        expect(player.status).not.toBe('error');
      },
      TEST_TIMEOUT_MS,
    );
  }
});
