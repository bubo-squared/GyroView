import { describe, expect, it } from 'vitest';

import type { AudioSampleSource } from '../ports/AudioSampleSource';
import type { EncodedAudioSample } from '../ports/AudioTrack';
import { seconds } from '../shared/units/time';

export interface AudioSampleSourceExpectations {
  readonly sampleCount: number;
  /**
   * How long each sample plays, in seconds; the track's first sample plays at `firstTimestamp`.
   */
  readonly sampleDuration: number;
  readonly firstTimestamp: number;
  /**
   * When the last sample stops playing, where the track's last sample is shorter than the rest
   * (as an AAC encoder cuts it); every sample lasting as long by default.
   */
  readonly duration?: number;
}

function collect(samples: AsyncIterable<EncodedAudioSample>): Promise<EncodedAudioSample[]> {
  return Array.fromAsync(samples);
}

/**
 * The AudioSampleSource port contract, run against the fake and against every real one over a
 * track of `sampleCount` samples of `sampleDuration`, the first at `firstTimestamp`.
 */
export function describeAudioSampleSourceContract(
  name: string,
  open: () => Promise<AudioSampleSource>,
  expected: AudioSampleSourceExpectations,
): void {
  const { sampleCount, sampleDuration, firstTimestamp } = expected;
  const end = firstTimestamp + sampleCount * sampleDuration;

  describe(`AudioSampleSource contract (${name})`, () => {
    it('lasts until its last sample stops playing', async () => {
      const source = await open();
      expect(source.duration).toBeCloseTo(expected.duration ?? end, 6);
    });

    it('hands out every sample in order from a time before the first', async () => {
      const source = await open();
      const samples = await collect(source.samplesFrom(seconds(firstTimestamp - 1)));
      expect(samples).toHaveLength(sampleCount);
      expect(samples[0]?.timestamp).toBeCloseTo(firstTimestamp, 6);
      expect(samples.at(-1)?.timestamp).toBeCloseTo(
        firstTimestamp + (sampleCount - 1) * sampleDuration,
        6,
      );
      expect(samples.every((sample) => sample.data.byteLength > 0)).toBe(true);
    });

    it('starts at the sample playing at a time', async () => {
      const source = await open();
      const time = firstTimestamp + 2.5 * sampleDuration;
      const [first] = await collect(source.samplesFrom(seconds(time)));
      expect(first?.timestamp).toBeCloseTo(firstTimestamp + 2 * sampleDuration, 6);
      expect(first?.duration).toBeCloseTo(sampleDuration, 6);
    });

    it('lets go of its samples when returned, even while a next sample is awaited', async () => {
      const source = await open();
      const samples = source.samplesFrom(seconds(firstTimestamp))[Symbol.asyncIterator]();
      await samples.next();
      const awaited = samples.next();
      await expect(samples.return?.()).resolves.toMatchObject({ done: true });
      await expect(awaited).resolves.toMatchObject({ done: true });
      await expect(samples.next()).resolves.toMatchObject({ done: true });
    });
  });
}
