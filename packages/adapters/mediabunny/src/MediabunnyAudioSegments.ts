import {
  GyroViewError,
  seconds,
  type AudioSegmentSource,
  type AudioTrackDescription,
  type Seconds,
} from '@gyroview/core';
import {
  EncodedAudioPacketSource,
  EncodedPacketSink,
  Mp4OutputFormat,
  NullTarget,
  Output,
  type AudioCodec,
  type EncodedPacket,
  type InputAudioTrack,
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
interface RemuxParts {
  readonly track: InputAudioTrack;
  readonly codec: AudioCodec;
  readonly decoderConfig: AudioDecoderConfig;
}

interface RemuxRun {
  readonly parts: RemuxParts;
  readonly from: Seconds;
  readonly output: Output;
  readonly source: EncodedAudioPacketSource;
  readonly channel: SegmentChannel;
}

/**
 * An audio track's packets re-packaged, unchanged, into fragmented MP4 with mediabunny.
 * Segments are taken from the muxer's box callbacks rather than from its byte stream: that
 * yields whole `ftyp`/`moov`/`moof`/`mdat` boxes and leaves out the `mfra` index the muxer
 * appends at the end, which Media Source Extensions do not accept. Fragmented output keeps the
 * track's own timestamps, so a run started mid-track lands at its true time.
 */
export class MediabunnyAudioSegments implements AudioSegmentSource {
  private constructor(
    private readonly parts: RemuxParts,
    public readonly duration: Seconds,
  ) {}

  public static async open(
    track: InputAudioTrack,
    description: AudioTrackDescription,
  ): Promise<MediabunnyAudioSegments> {
    const [codec, decoderConfig, duration] = await Promise.all([
      track.getCodec(),
      track.getDecoderConfig(),
      track.computeDuration(),
    ]);
    if (codec === null || decoderConfig === null) {
      throw new GyroViewError(
        'codec-unsupported',
        `audio track ${description.trackIndex} (${description.codec}) cannot be re-packaged for playback`,
      );
    }
    return new MediabunnyAudioSegments({ track, codec, decoderConfig }, seconds(duration));
  }

  public get mimeType(): string {
    return `audio/mp4; codecs="${this.parts.decoderConfig.codec}"`;
  }

  public segmentsFrom(from: Seconds): AsyncIterable<Uint8Array<ArrayBuffer>> {
    return remux(this.parts, from);
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
      decoderConfig: run.parts.decoderConfig,
    };
    for await (const packet of packetsFrom(run.parts.track, run.from)) {
      await run.channel.waitForRoom();
      if (run.channel.isClosed) return;
      await run.source.add(packet, meta);
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

/**
 * Packets in decode order from the one playing at `time` (or the first one after it) to the end.
 */
async function* packetsFrom(track: InputAudioTrack, time: Seconds): AsyncGenerator<EncodedPacket> {
  const sink = new EncodedPacketSink(track);
  const start = (await sink.getPacket(time)) ?? (await sink.getFirstPacket());
  if (start === null) return;
  yield* sink.packets(start);
}
