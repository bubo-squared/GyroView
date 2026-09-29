import {
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
 * Segments (each fragment is two: `moof` and `mdat`) that may wait for the consumer before
 * re-packaging pauses.
 */
const SEGMENTS_AHEAD = 4;
/**
 * The codec strings of the audio the cameras record, AAC (`mp4a.40.2` for AAC-LC), and mediabunny's
 * name for it. Other codecs are not re-packaged: the picture then plays on a silent clock.
 */
const AAC_CODEC_STRING_PREFIX = 'mp4a.40.';
const AAC: AudioCodec = 'aac';

type Segment = Uint8Array<ArrayBuffer>;

/**
 * AudioPackager over mediabunny: the samples re-packaged, unchanged, into fragmented MP4.
 * Segments are taken from the muxer's box callbacks rather than from its byte stream: that
 * yields whole `ftyp`/`moov`/`moof`/`mdat` boxes and leaves out the `mfra` index the muxer
 * appends at the end, which Media Source Extensions do not accept. Fragmented output keeps the
 * track's own timestamps, so segments started mid-track land at their true time.
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

function fragmentedMp4Into(channel: SegmentChannel): Mp4OutputFormat {
  const forward = (data: Uint8Array): void => {
    channel.push(new Uint8Array(data));
  };
  return new Mp4OutputFormat({
    fastStart: 'fragmented',
    minimumFragmentDuration: FRAGMENT_DURATION_SECONDS,
    onFtyp: forward,
    onMoov: forward,
    onMoof: forward,
    onMdat: forward,
  });
}
