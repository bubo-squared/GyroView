import {
  ensureInvariant,
  GyroViewError,
  type AudioDecoderConfiguration,
  type AudioPackager,
  type AudioSampleSource,
  type AudioSegmentSource,
  type EncodedAudioSample,
  type Seconds,
} from '@gyroview/core';
import {
  EncodedAudioPacketSource,
  EncodedPacket,
  Mp4OutputFormat,
  NullTarget,
  Output,
  type AudioCodec,
} from 'mediabunny';

import { SegmentChannel } from './SegmentChannel';

/**
 * Seconds of audio per media segment: short enough that a seek has sound quickly, long enough
 * that appends stay cheap.
 */
const FRAGMENT_DURATION_SECONDS = 1;
/**
 * Media segments that may wait for the consumer before re-packaging pauses.
 */
const SEGMENTS_AHEAD = 2;
/**
 * The codec strings of the audio the cameras record, AAC (`mp4a.40.2` for AAC-LC), and mediabunny's
 * name for it. Other codecs are not re-packaged: the picture then plays on a silent clock.
 */
const AAC_CODEC_STRING_PREFIX = 'mp4a.40.';
const AAC: AudioCodec = 'aac';

type Segment = Uint8Array<ArrayBuffer>;

/**
 * AudioPackager over mediabunny: the samples re-packaged, unchanged, into fragmented MP4.
 * Segments are assembled from the muxer's box callbacks rather than taken from its byte stream:
 * that yields whole segments and leaves out the `mfra` index the muxer appends at the end, which
 * Media Source Extensions do not accept. Fragmented output keeps the track's own timestamps, so
 * segments started mid-track land at their true time.
 */
export class MediabunnyAudioPackager implements AudioPackager {
  public segmentsOf(
    samples: AudioSampleSource,
    configuration: AudioDecoderConfiguration,
  ): AudioSegmentSource {
    const codec = muxedCodecOf(configuration);
    return {
      mimeType: `audio/mp4; codecs="${configuration.codec}"`,
      duration: samples.duration,
      segmentsFrom: (from: Seconds): AsyncIterable<Segment> => ({
        [Symbol.asyncIterator]: (): AsyncIterator<Segment> =>
          remux({ samples, configuration, codec }, from),
      }),
    };
  }
}

function muxedCodecOf(configuration: AudioDecoderConfiguration): AudioCodec {
  if (configuration.codec.startsWith(AAC_CODEC_STRING_PREFIX)) return AAC;
  throw new GyroViewError(
    'codec-unsupported',
    `audio in ${configuration.codec} cannot be re-packaged for playback`,
  );
}

interface RemuxParts {
  readonly samples: AudioSampleSource;
  readonly configuration: AudioDecoderConfiguration;
  readonly codec: AudioCodec;
}

interface RemuxRun {
  readonly samples: AsyncIterator<EncodedAudioSample>;
  readonly configuration: AudioDecoderConfiguration;
  readonly output: Output;
  readonly source: EncodedAudioPacketSource;
  readonly channel: SegmentChannel;
}

/**
 * Starts re-packaging from `from` into a channel and hands out its consumer's side. When the
 * consumer leaves, the samples are let go of at once, even while one is awaited, and the muxer
 * once the producer has noticed.
 */
function remux(parts: RemuxParts, from: Seconds): AsyncIterator<Segment> {
  const channel = new SegmentChannel(SEGMENTS_AHEAD);
  const output = new Output({ format: fragmentedMp4Into(channel), target: new NullTarget() });
  const source = new EncodedAudioPacketSource(parts.codec);
  output.addAudioTrack(source);
  const samples = parts.samples.samplesFrom(from)[Symbol.asyncIterator]();
  const production = produce({
    samples,
    configuration: parts.configuration,
    output,
    source,
    channel,
  });
  return channel.segments(() => {
    void samples.return?.();
    void releaseAfter(production, output);
  });
}

/**
 * Frees the muxer once the producer has noticed the closed channel, without making a consumer
 * that left early (a seek) wait for a sample still in flight.
 */
async function releaseAfter(production: Promise<void>, output: Output): Promise<void> {
  await production;
  if (output.state === 'finalized') return;
  try {
    await output.cancel();
  } catch {
    // Nothing is listening any more; the muxer's resources go with it either way.
  }
}

/**
 * Feeds samples to the muxer at the consumer's pace; every failure ends up in the channel.
 */
async function produce(run: RemuxRun): Promise<void> {
  try {
    await run.output.start();
    let meta: { decoderConfig: AudioDecoderConfig } | undefined = {
      decoderConfig: decoderConfigOf(run.configuration),
    };
    for (let next = await run.samples.next(); next.done !== true; next = await run.samples.next()) {
      await run.channel.waitForRoom();
      if (run.channel.isClosed) return;
      await run.source.add(packetOf(next.value), meta);
      meta = undefined;
    }
    if (run.channel.isClosed) return;
    await run.output.finalize();
    run.channel.close();
  } catch (error) {
    run.channel.fail(error);
  }
}

function packetOf(sample: EncodedAudioSample): EncodedPacket {
  return new EncodedPacket(sample.data, 'key', sample.timestamp, sample.duration);
}

function decoderConfigOf(configuration: AudioDecoderConfiguration): AudioDecoderConfig {
  return {
    codec: configuration.codec,
    sampleRate: configuration.sampleRate,
    numberOfChannels: configuration.numberOfChannels,
    ...(configuration.description && { description: configuration.description }),
  };
}

/**
 * The muxer's boxes handed on as whole segments: the initialization segment (`ftyp` and `moov`)
 * and each media segment (`moof` and its `mdat`). A consumer that stops between two segments, as
 * a seek does, then never leaves a source buffer's parser inside one, where Chromium reads the
 * next segments' bytes as the samples of the `moof` it holds and fails to decode them.
 */
function fragmentedMp4Into(channel: SegmentChannel): Mp4OutputFormat {
  const segment = new SegmentAssembly(channel);
  return new Mp4OutputFormat({
    fastStart: 'fragmented',
    minimumFragmentDuration: FRAGMENT_DURATION_SECONDS,
    onFtyp: (data): void => {
      segment.begin(data);
    },
    onMoov: (data): void => {
      segment.end(data);
    },
    onMoof: (data): void => {
      segment.begin(data);
    },
    onMdat: (data): void => {
      segment.end(data);
    },
  });
}

/**
 * A segment's first box held until the box that ends it arrives, then both pushed as one.
 */
class SegmentAssembly {
  private opening: Uint8Array | undefined;

  public constructor(private readonly channel: SegmentChannel) {}

  public begin(box: Uint8Array): void {
    ensureInvariant(this.opening === undefined, 'a segment began before the last one ended');
    this.opening = new Uint8Array(box);
  }

  public end(box: Uint8Array): void {
    const { opening } = this;
    ensureInvariant(opening !== undefined, 'a segment ended that never began');
    const whole = new Uint8Array(opening.byteLength + box.byteLength);
    whole.set(opening);
    whole.set(box, opening.byteLength);
    this.opening = undefined;
    this.channel.push(whole);
  }
}
