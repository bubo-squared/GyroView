import { describe, expect, it } from 'vitest';

import { describeAudioSampleSourceContract } from './AudioSampleSource.contract';
import { FakeAudioSampleSource } from './FakeAudioSampleSource';
import { seconds } from '../shared/units/time';

const SAMPLE_DURATION = 1024 / 48_000;
const FIRST = 0.1;

function fakeSound(): FakeAudioSampleSource {
  return new FakeAudioSampleSource(
    Array.from({ length: 20 }, (_, index) => ({
      timestamp: seconds(FIRST + index * SAMPLE_DURATION),
      duration: seconds(SAMPLE_DURATION),
      data: Uint8Array.of(index + 1),
    })),
  );
}

describeAudioSampleSourceContract('fake', () => Promise.resolve(fakeSound()), {
  sampleCount: 20,
  sampleDuration: SAMPLE_DURATION,
  firstTimestamp: FIRST,
});

describe('FakeAudioSampleSource', () => {
  it('counts the iterations under way', async () => {
    const sound = fakeSound();
    const samples = sound.samplesFrom(seconds(0))[Symbol.asyncIterator]();
    await samples.next();
    expect(sound.openCursors).toBe(1);
    await samples.return?.();
    expect(sound.openCursors).toBe(0);
  });
});
