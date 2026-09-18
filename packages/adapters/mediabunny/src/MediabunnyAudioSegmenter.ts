import {
  GyroViewError,
  type AudioDecoderConfiguration,
  type AudioSegmentSource,
  type AudioTrackReader,
  type EncodedAudioPacket,
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
 * Codec string prefixes (RFC 6381 / WebCodecs registry) mapped onto mediabunny's codec names.
 * Insta360 cameras record AAC-LC (`mp4a.40.2`); the others are what an MP4 may otherwise carry.
 */
const AUDIO_CODEC_BY_PREFIX: readonly (readonly [prefix: string, codec: AudioCodec])[] = [
  ['mp4a.40.', 'aac'],
  ['mp4a.6b', 'mp3'],
  ['mp4a.69', 'mp3'],
  ['mp3', 'mp3'],
  ['opus', 'opus'],
  ['flac', 'flac'],
  ['vorbis', 'vorbis'],
  ['ac-3', 'ac3'],
  ['ec-3', 'eac3'],
];

interface RemuxParts {
  readonly track: AudioTrackReader;
  readonly configuration: AudioDecoderConfiguration;
  readonly codec: AudioCodec;
}

interface RemuxRun {
  readonly parts: RemuxParts;
  readonly from: Seconds;
  readonly output: Output;
  readonly source: EncodedAudioPacketSource;
  readonly channel: SegmentChannel;
}

/**
 * Builds an AudioSegmentSource by re-packaging the track's packets, unchanged, into fragmented
 * MP4 with mediabunny. Segments are taken from the muxer's box callbacks rather than from its
 * byte stream: that yields whole `ftyp`/`moov`/`moof`/`mdat` boxes and leaves out the `mfra`
 * index the muxer appends at the end, which Media Source Extensions do not accept. Fragmented
 * output keeps the track's own timestamps, so a run started mid-track lands at its true time.
 */
export class MediabunnyAudioSegmenter {
  public async open(track: AudioTrackReader): Promise<AudioSegmentSource> {
    const [configuration, duration] = await Promise.all([
      track.decoderConfiguration(),
      track.duration(),
    ]);
    const parts: RemuxParts = { track, configuration, codec: audioCodecOf(configuration.codec) };
    return {
      mimeType: `audio/mp4; codecs="${configuration.codec}"`,
      duration,
      segmentsFrom: (from): AsyncIterable<Uint8Array<ArrayBuffer>> => remux(parts, from),
    };
  }
}

async function* remux(parts: RemuxParts, from: Seconds): AsyncGenerator<Uint8Array<ArrayBuffer>> {
  const channel = new SegmentChannel(SEGMENTS_AHEAD);
  const output = new Output({ format: fragmentedMp4Into(channel), target: new NullTarget() });
  const source = new EncodedAudioPacketSource(parts.codec);
  output.addAudioTrack(source);
  const production = produce({ parts, from, output, source, channel });
  try {
    yield* channel.segments();
  } finally {
    channel.close();
    void releaseAfter(production, output);
  }
}

/**
 * Frees the muxer once the producer has noticed the closed channel, without making a consumer
 * that left early (a seek) wait for a packet read still in flight.
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
 * Feeds packets to the muxer at the consumer's pace; every failure ends up in the channel.
 */
async function produce(run: RemuxRun): Promise<void> {
  try {
    await run.output.start();
    let meta: { decoderConfig: AudioDecoderConfig } | undefined = {
      decoderConfig: decoderConfigOf(run.parts.configuration),
    };
    for await (const packet of run.parts.track.packetsFrom(run.from)) {
      await run.channel.waitForRoom();
      if (run.channel.isClosed) return;
      await run.source.add(toMediabunnyPacket(packet), meta);
      meta = undefined;
    }
    await run.output.finalize();
    run.channel.close();
  } catch (error) {
    run.channel.fail(error);
  }
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

function decoderConfigOf(configuration: AudioDecoderConfiguration): AudioDecoderConfig {
  const { description } = configuration;
  return {
    codec: configuration.codec,
    sampleRate: configuration.sampleRate,
    numberOfChannels: configuration.channelCount,
    ...(description && { description }),
  };
}

function toMediabunnyPacket(packet: EncodedAudioPacket): EncodedPacket {
  return new EncodedPacket(packet.data, 'key', packet.timestamp, packet.duration);
}

function audioCodecOf(codecString: string): AudioCodec {
  const lower = codecString.toLowerCase();
  const match = AUDIO_CODEC_BY_PREFIX.find(([prefix]) => lower.startsWith(prefix));
  if (match) return match[1];
  throw new GyroViewError(
    'codec-unsupported',
    `audio codec ${codecString} cannot be re-packaged for playback`,
  );
}
