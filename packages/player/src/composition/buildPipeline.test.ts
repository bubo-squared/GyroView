import {
  IDENTITY_MATRIX3,
  seconds,
  UPRIGHT_MOUNTING,
  type Matrix3,
  type Mounting,
  type Presentation,
  type SeamMeter,
  type Vector3,
} from '@gyroview/core';
import { afterEach, describe, expect, it } from 'vitest';

import { browserPorts } from './browserPorts';
import {
  buildPipeline,
  sinksOver,
  stitchingSetupOf,
  type SinkMotion,
  type SinkRenderer,
} from './buildPipeline';
import { openRecording } from './openRecording';
import type { OpenedRecording } from './OpenedRecording';
import { X5_RECORDING_URL, X5_RECORDING_WITH_AUDIO_URL } from '../test/recordings';

/**
 * The seam reads bright on lens 0 and dark on lens 1: matching halves lens 0's gain to hold it to
 * lens 1, or doubles lens 1's to hold it to lens 0.
 */
const BRIGHT_AND_DARK: readonly Vector3[] = [
  [0.8, 0.8, 0.8],
  [0.4, 0.4, 0.4],
];
/**
 * A mounting whose view opens facing lens 0, where the upright camera's opens facing lens 1.
 */
const FACING_LENS_0: Mounting = { name: 'facing lens 0', toBody: IDENTITY_MATRIX3 };

/**
 * A renderer that records what the sinks ask of it, in order.
 */
class RecordingRenderer implements SinkRenderer {
  public readonly lensCount = 2;
  public readonly calls: string[] = [];
  public readonly rotations: Matrix3[] = [];
  public readonly gains: (readonly Vector3[])[] = [];

  public present(): void {
    this.calls.push('present');
  }

  public setStabilization(rotation: Matrix3): void {
    this.calls.push('setStabilization');
    this.rotations.push(rotation);
  }

  public setRowCorrections(): void {
    this.calls.push('setRowCorrections');
  }

  public createSeamMeter(): SeamMeter {
    return {
      measure: (): Promise<readonly Vector3[]> => Promise.resolve(BRIGHT_AND_DARK),
      dispose: (): void => {
        // Nothing to give back.
      },
    };
  }

  public setLensGains(gains: readonly Vector3[]): void {
    this.calls.push('setLensGains');
    this.gains.push(gains);
  }
}

function presentationAt(time: number): Presentation<VideoFrame> {
  return { pair: { timestamp: seconds(time), frames: [] }, mediaTime: seconds(time) };
}

describe('buildPipeline', () => {
  const hosts: HTMLElement[] = [];

  afterEach(() => {
    for (const element of hosts.splice(0)) element.remove();
  });

  it('builds nothing on the host for a load a newer one has superseded', async () => {
    const ports = browserPorts();
    const opened = await openRecording(
      { main: { url: X5_RECORDING_WITH_AUDIO_URL }, second: undefined },
      ports,
      new AbortController().signal,
    );
    const canvas = document.createElement('canvas');
    const audio = document.createElement('audio');
    hosts.push(canvas, audio);
    const sourceChanges: MutationRecord[] = [];
    const observer = new MutationObserver((records) => {
      sourceChanges.push(...records);
    });
    observer.observe(audio, { attributeFilter: ['src'] });
    const superseded = new AbortController();
    superseded.abort();

    await expect(
      buildPipeline({
        opened,
        host: { canvas, audio },
        decoderPort: ports.decoderPort,
        pageTime: ports.pageTime,
        signal: superseded.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });

    // The audio element the host shares with every load was never given a source, not even for a
    // moment, and the canvas has no GL context, so it still offers a 2D one.
    sourceChanges.push(...observer.takeRecords());
    observer.disconnect();
    expect(sourceChanges).toEqual([]);
    expect(canvas.getContext('2d')).not.toBeNull();
    opened.dispose();
  });

  it('lets the downloads read ahead once playing starts, and not before', async () => {
    const ports = browserPorts();
    const opened = await openRecording(
      { main: { url: X5_RECORDING_WITH_AUDIO_URL }, second: undefined },
      ports,
      new AbortController().signal,
    );
    const canvas = document.createElement('canvas');
    const audio = document.createElement('audio');
    audio.muted = true;
    hosts.push(canvas, audio);
    let readsAhead = 0;
    const readAhead = (): void => {
      readsAhead += 1;
      opened.readAhead();
    };
    const pipeline = await buildPipeline({
      opened: { ...opened, readAhead },
      host: { canvas, audio },
      decoderPort: ports.decoderPort,
      pageTime: ports.pageTime,
      signal: new AbortController().signal,
    });
    expect(readsAhead).toBe(0);

    await pipeline.session.play();

    expect(readsAhead).toBeGreaterThan(0);
    pipeline.dispose();
    opened.dispose();
  });
});

describe('sinksOver', () => {
  const recordings: OpenedRecording[] = [];

  afterEach(() => {
    for (const recording of recordings.splice(0)) recording.dispose();
  });

  async function openSynthetic(): Promise<OpenedRecording> {
    const recording = await openRecording(
      { main: { url: X5_RECORDING_URL }, second: undefined },
      browserPorts(),
      new AbortController().signal,
    );
    recordings.push(recording);
    return recording;
  }

  it('turns the picture for the gyro before every pair it draws', async () => {
    const opened = await openSynthetic();
    const renderer = new RecordingRenderer();
    const { stabilizing, gainMatching } = sinksOver(renderer, opened, stitchingSetupOf(opened));
    gainMatching.present(presentationAt(0));
    gainMatching.present(presentationAt(0.1));
    expect(stabilizing).toBeDefined();
    expect(renderer.calls).toEqual([
      'setStabilization',
      'setRowCorrections',
      'present',
      'setStabilization',
      'setRowCorrections',
      'present',
    ]);
  });

  it('draws a recording without a gyro upright, turned once rather than before each pair', async () => {
    const opened = await openSynthetic();
    const renderer = new RecordingRenderer();
    const { stabilizing, gainMatching } = sinksOver(
      renderer,
      { ...opened, motion: undefined },
      stitchingSetupOf(opened),
    );
    gainMatching.present(presentationAt(0));
    gainMatching.present(presentationAt(0.1));
    expect(stabilizing).toBeUndefined();
    expect(renderer.calls).toEqual(['setStabilization', 'present', 'present']);
    expect(renderer.rotations).toEqual([UPRIGHT_MOUNTING.toBody]);
  });

  it('matches the gains to the lens the view opens facing: lens 1 without a gyro, else as mounted', async () => {
    const opened = await openSynthetic();
    const { motion } = opened;
    if (!motion) throw new Error('the synthetic recording has a gyro');
    const gainsMatchedOver = async (sinkMotion: SinkMotion): Promise<readonly Vector3[]> => {
      const renderer = new RecordingRenderer();
      const { gainMatching } = sinksOver(renderer, sinkMotion, stitchingSetupOf(opened));
      gainMatching.enable();
      gainMatching.present(presentationAt(0));
      await gainMatching.matchNow();
      const gains = renderer.gains.at(-1) ?? [];
      gainMatching.dispose();
      return gains;
    };
    expect(await gainsMatchedOver({ ...opened, motion: undefined })).toEqual([
      [0.5, 0.5, 0.5],
      [1, 1, 1],
    ]);
    expect(
      await gainsMatchedOver({ ...opened, motion: { ...motion, mounting: FACING_LENS_0 } }),
    ).toEqual([
      [1, 1, 1],
      [2, 2, 2],
    ]);
  });
});
