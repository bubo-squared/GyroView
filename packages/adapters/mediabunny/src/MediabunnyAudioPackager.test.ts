import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  Deferred,
  readSampleTable,
  seconds,
  type AudioDecoderConfiguration,
  type AudioSampleSource,
  type EncodedAudioSample,
  type Seconds,
} from '@gyroview/core';
import {
  describeAudioSegmentSourceContract,
  FakeAudioSampleSource,
  InMemoryRandomAccessSource,
} from '@gyroview/core/testing';
import { BufferSource, EncodedPacketSink, Input, MP4 } from 'mediabunny';
import { describe, expect, it } from 'vitest';

import { MediabunnyAudioPackager } from './MediabunnyAudioPackager';
import { MediabunnyCodecReader } from './MediabunnyCodecReader';

const FIXTURE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../test/fixtures/synthetic/dual-track-aac-64px-10fps-3s.mp4',
);

interface FixtureSound {
  readonly samples: EncodedAudioSample[];
  readonly configuration: AudioDecoderConfiguration;
}

/**
 * The fixture's AAC samples as the core's sample table finds them, and their configuration as
 * the codec reader tells it.
 */
async function fixtureSound(): Promise<FixtureSound> {
  const bytes = new Uint8Array(readFileSync(FIXTURE));
  const { table, movieBytes } = await readSampleTable(new InMemoryRandomAccessSource(bytes));
  const [track] = table.audioTracks;
  const codecs = await new MediabunnyCodecReader().read(movieBytes);
  const [codec] = codecs.audio;
  if (!track || !codec) throw new Error('the fixture has no sound');
  const samples = Array.from({ length: track.sampleCount }, (_, sample) => {
    const range = track.rangeOf(sample);
    return {
      timestamp: track.timestampOf(sample),
      duration: track.durationOf(sample),
      data: bytes.subarray(range.offset, range.end),
    };
  });
  return { samples, configuration: codec.configuration };
}

async function segmentsOfFixture(): Promise<ReturnType<MediabunnyAudioPackager['segmentsOf']>> {
  const { samples, configuration } = await fixtureSound();
  return new MediabunnyAudioPackager().segmentsOf(
    new FakeAudioSampleSource(samples),
    configuration,
  );
}

async function parseBack(
  segments: AsyncIterable<Uint8Array>,
): Promise<{ duration: number; firstTimestamp: number }> {
  const parts = await Array.fromAsync(segments);
  const bytes = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  const input = new Input({ formats: [MP4], source: new BufferSource(bytes) });
  try {
    const [track] = await input.getAudioTracks();
    if (!track) throw new Error('no audio track in the re-packaged bytes');
    const first = await new EncodedPacketSink(track).getFirstPacket();
    return {
      duration: await input.computeDuration(),
      firstTimestamp: first?.timestamp ?? NaN,
    };
  } finally {
    input.dispose();
  }
}

/**
 * Hands out its first samples at once and holds the rest until its gate opens, as samples come
 * that are still downloading; counts the iterations under way.
 */
class GatedSampleSource implements AudioSampleSource {
  public readonly gate = new Deferred<void>();
  private readonly source: FakeAudioSampleSource;

  public constructor(
    samples: readonly EncodedAudioSample[],
    private readonly ungated: number,
  ) {
    this.source = new FakeAudioSampleSource(samples);
  }

  public get duration(): Seconds {
    return this.source.duration;
  }

  public get openCursors(): number {
    return this.source.openCursors;
  }

  public samplesFrom(time: Seconds): AsyncIterable<EncodedAudioSample> {
    const samples = this.source.samplesFrom(time)[Symbol.asyncIterator]();
    let handedOut = 0;
    return {
      [Symbol.asyncIterator]: (): AsyncIterator<EncodedAudioSample> => ({
        next: async (): Promise<IteratorResult<EncodedAudioSample>> => {
          handedOut += 1;
          if (handedOut > this.ungated) await this.gate.promise;
          return samples.next();
        },
        return: (): Promise<IteratorResult<EncodedAudioSample>> =>
          samples.return?.() ?? Promise.resolve({ done: true, value: undefined }),
      }),
    };
  }
}

describeAudioSegmentSourceContract('mediabunny packager', segmentsOfFixture, { duration: 3 });

describe('MediabunnyAudioPackager', () => {
  it('names the segments by the configured codec and lasts as long as the samples', async () => {
    const segments = await segmentsOfFixture();
    expect(segments.mimeType).toBe('audio/mp4; codecs="mp4a.40.2"');
    expect(segments.duration).toBeCloseTo(3, 1);
  });

  it('re-packages every sample, so the segments parse back with the same duration', async () => {
    const segments = await segmentsOfFixture();
    const parsed = await parseBack(segments.segmentsFrom(seconds(0)));
    expect(parsed.duration).toBeCloseTo(3, 1);
    expect(parsed.firstTimestamp).toBeCloseTo(0, 3);
  });

  it('starts at the sample playing at the requested time and keeps the track timestamps', async () => {
    const segments = await segmentsOfFixture();
    const parsed = await parseBack(segments.segmentsFrom(seconds(1.5)));
    expect(parsed.firstTimestamp).toBeLessThanOrEqual(1.5);
    expect(parsed.firstTimestamp).toBeGreaterThan(1.4);
  });

  it('lets go of the samples at once when its segments are left, a sample still awaited', async () => {
    const { samples, configuration } = await fixtureSound();
    const gated = new GatedSampleSource(samples, 3);
    const segments = new MediabunnyAudioPackager()
      .segmentsOf(gated, configuration)
      .segmentsFrom(seconds(0))
      [Symbol.asyncIterator]();
    const awaited = segments.next();
    await expect.poll(() => gated.openCursors).toBe(1);
    await segments.return?.();
    expect(gated.openCursors).toBe(0);
    gated.gate.resolve();
    await awaited;
  });

  it('refuses a codec it cannot re-package', async () => {
    const { samples, configuration } = await fixtureSound();
    const opus = { ...configuration, codec: 'opus' };
    expect(() =>
      new MediabunnyAudioPackager().segmentsOf(new FakeAudioSampleSource(samples), opus),
    ).toThrow(expect.objectContaining({ code: 'codec-unsupported' }) as Error);
  });
});
