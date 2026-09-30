import type { AudioSampleSource } from '../ports/AudioSampleSource';
import type { EncodedAudioSample } from '../ports/AudioTrack';
import { seconds, type Seconds } from '../shared/units/time';

const DONE: IteratorReturnResult<undefined> = { done: true, value: undefined };

/**
 * Test double for an audio track's samples, held in memory in decode order; each sample comes a
 * turn after it is asked for, as a read would. Counts the iterations under way.
 */
export class FakeAudioSampleSource implements AudioSampleSource {
  /**
   * Sample iterations started and neither finished nor returned.
   */
  public openReadings = 0;

  public constructor(private readonly samples: readonly EncodedAudioSample[]) {}

  public get duration(): Seconds {
    const last = this.samples.at(-1);
    return seconds(last ? last.timestamp + last.duration : 0);
  }

  public samplesFrom(time: Seconds): AsyncIterable<EncodedAudioSample> {
    return {
      [Symbol.asyncIterator]: (): AsyncIterator<EncodedAudioSample> => this.readingAt(time),
    };
  }

  private readingAt(time: Seconds): FakeSampleReading {
    const playing = this.samples.findLastIndex((sample) => sample.timestamp <= time);
    this.openReadings += 1;
    const onClose = (): void => {
      this.openReadings -= 1;
    };
    return new FakeSampleReading(this.samples.slice(Math.max(playing, 0)), onClose);
  }
}

class FakeSampleReading implements AsyncIterator<EncodedAudioSample> {
  private position = 0;
  private isOpen = true;

  public constructor(
    private readonly samples: readonly EncodedAudioSample[],
    private readonly onClose: () => void,
  ) {}

  public async next(): Promise<IteratorResult<EncodedAudioSample>> {
    await Promise.resolve();
    const sample = this.isOpen ? this.samples[this.position] : undefined;
    if (!sample) return this.close();
    this.position += 1;
    return { done: false, value: sample };
  }

  public return(): Promise<IteratorResult<EncodedAudioSample>> {
    return Promise.resolve(this.close());
  }

  private close(): IteratorReturnResult<undefined> {
    if (this.isOpen) this.onClose();
    this.isOpen = false;
    return DONE;
  }
}
