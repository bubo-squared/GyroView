import { DecodePipeline, type FramePair } from '@gyroview/core';
import { DECODE_PIPELINE_OPTIONS, type OpenedRecording } from '@gyroview/player/composition';
import type { TestContext } from 'vitest';

import {
  availabilityOf,
  closeAll,
  openedOrSkip,
  port,
  takePairs,
  timingOf,
  type Availability,
  type PairTiming,
} from './realRecordingSupport';
import type { SampleRecording } from './sampleUrls';

/**
 * Consecutive pairs decoded from one moment: the first and the last are far enough apart for the
 * camera to turn visibly (half a second at 30 fps), close enough for the scene to stay put.
 */
const PAIRS_PER_MOMENT = 16;
const KEPT_AT_START = 2;

/**
 * Three pairs of one moment of a sample, the first two and the last of `PAIRS_PER_MOMENT`
 * consecutive pairs, which their owner closes, and the timing of all of them. The second is the
 * frame after the first: what changes between them on a still picture is the sampling's.
 */
export interface Moment {
  readonly first: FramePair<VideoFrame>;
  readonly second: FramePair<VideoFrame>;
  readonly later: FramePair<VideoFrame>;
  readonly timings: readonly PairTiming[];
}

/**
 * Decodes the moment at `time`, closing every pair but the three it keeps.
 */
export async function decodeMoment(opened: OpenedRecording, time: number): Promise<Moment> {
  const pipeline = new DecodePipeline<VideoFrame>(
    opened.frameSources,
    port,
    DECODE_PIPELINE_OPTIONS,
  );
  const pairs = await takePairs(pipeline, time, PAIRS_PER_MOMENT);
  const timings = pairs.map((pair) => timingOf(pair));
  const [first, second] = pairs;
  const later = pairs.at(-1);
  closeAll(pairs.slice(KEPT_AT_START, -1));
  if (!first || !second || !later) throw new Error(`no pairs decoded at ${time} s`);
  return { first, second, later, timings };
}

export function closeMoment(moment: Moment): void {
  closeAll([moment.first, moment.second, moment.later]);
}

/**
 * A sample opened once for all the tests of a file, and each moment of it decoded once: opening
 * and seeking cost far more than anything the tests do with the pictures. A test skips when the
 * sample is unavailable, as `openSample` makes it.
 */
export class SharedSample {
  private opening: Promise<Availability> | undefined;
  private readonly moments = new Map<number, Promise<Moment>>();
  private readonly cleanups: (() => void)[] = [];

  public constructor(public readonly sample: SampleRecording) {}

  public async open(context: TestContext): Promise<OpenedRecording> {
    this.opening ??= this.openOnce();
    return openedOrSkip(context, await this.opening);
  }

  public async momentAt(context: TestContext, time: number): Promise<Moment> {
    const opened = await this.open(context);
    const decoding = this.moments.get(time) ?? this.decodeOnce(opened, time);
    this.moments.set(time, decoding);
    return decoding;
  }

  /**
   * Closes the frames and the recording, once the file's tests are done with them.
   */
  public dispose(): void {
    for (const cleanup of this.cleanups.splice(0).toReversed()) cleanup();
  }

  private async openOnce(): Promise<Availability> {
    const availability = await availabilityOf(this.sample);
    if ('opened' in availability) {
      this.cleanups.push(() => {
        availability.opened.dispose();
      });
    }
    return availability;
  }

  private async decodeOnce(opened: OpenedRecording, time: number): Promise<Moment> {
    const moment = await decodeMoment(opened, time);
    this.cleanups.push(() => {
      closeMoment(moment);
    });
    return moment;
  }
}
