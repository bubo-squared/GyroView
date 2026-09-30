import type { FileDownload } from './FileDownload';
import type { CursorSample, SampleCursor } from './SampleCursor';
import type { TrackSampleTable } from '../../domain/container/TrackSampleTable';
import type { VideoTrackCodec } from '../../ports/CodecReader';
import type { VideoTrackReader } from '../../ports/VideoTrackReader';
import type {
  EncodedVideoPacket,
  KeyframeTime,
  VideoDecoderConfiguration,
  VideoTrackDescription,
} from '../../ports/VideoTrack';
import { Ending, ITERATION_END } from '../../shared/async/iteration';
import { GyroViewError } from '../../shared/errors/GyroViewError';
import type { Seconds } from '../../shared/units/time';

export interface DownloadedVideoTrackParts {
  readonly download: FileDownload;
  readonly track: TrackSampleTable;
  readonly codec: VideoTrackCodec;
}

/**
 * One lens's track, its packets read through the file's download. Where decoding may start comes
 * from the sample table; the first packet decoding starts from is checked against its own bytes,
 * and a sync sample found not to be a keyframe is passed over from then on, so the times it tells
 * agree with the packets it hands out.
 */
export class DownloadedVideoTrack implements VideoTrackReader {
  private readonly rejected = new Set<number>();

  public constructor(private readonly parts: DownloadedVideoTrackParts) {}

  public get description(): VideoTrackDescription {
    return this.parts.codec.description;
  }

  public decoderConfiguration(): Promise<VideoDecoderConfiguration> {
    return Promise.resolve(this.parts.codec.configuration);
  }

  public keyframeAt(time: Seconds): Promise<KeyframeTime | undefined> {
    return Promise.resolve(this.timeOf(this.keyframeSampleAt(time)));
  }

  public firstKeyframe(): Promise<KeyframeTime | undefined> {
    return Promise.resolve(this.timeOf(this.firstKeyframeSample()));
  }

  public packetsFrom(time: Seconds): AsyncIterable<EncodedVideoPacket> {
    return {
      [Symbol.asyncIterator]: (): AsyncIterator<EncodedVideoPacket> =>
        new PacketReading({
          track: this.parts.track,
          open: (): SampleCursor | undefined => this.cursorFrom(time),
          reject: (sample): void => {
            this.rejected.add(sample);
          },
          packetOf: (read): EncodedVideoPacket => this.packetOf(read),
        }),
    };
  }

  public sampleTimestamps(): Promise<readonly Seconds[]> {
    return Promise.resolve(this.parts.track.timestampsInPresentationOrder());
  }

  public frameCount(): Promise<number> {
    return Promise.resolve(this.parts.track.sampleCount);
  }

  private cursorFrom(time: Seconds): SampleCursor | undefined {
    const start = this.keyframeSampleAt(time) ?? this.firstKeyframeSample();
    return start === undefined
      ? undefined
      : this.parts.download.openCursor(this.parts.track, start, time);
  }

  /**
   * The sync sample decoding for `time` starts at, past those found not to be keyframes.
   */
  private keyframeSampleAt(time: Seconds): number | undefined {
    const { track } = this.parts;
    let sample = track.keyframeAt(time);
    while (sample !== undefined && this.rejected.has(sample)) {
      sample = track.syncSampleAtOrBefore(sample - 1);
    }
    return sample;
  }

  private firstKeyframeSample(): number | undefined {
    const { track } = this.parts;
    let sample = track.syncSampleAtOrAfter(0);
    while (sample !== undefined && this.rejected.has(sample)) {
      sample = track.syncSampleAtOrAfter(sample + 1);
    }
    return sample;
  }

  private timeOf(sample: number | undefined): KeyframeTime | undefined {
    const { track } = this.parts;
    return sample === undefined
      ? undefined
      : { timestamp: track.timestampOf(sample), duration: track.durationOf(sample) };
  }

  private packetOf(read: CursorSample): EncodedVideoPacket {
    const { track } = this.parts;
    return {
      timestamp: track.timestampOf(read.sample),
      duration: track.durationOf(read.sample),
      isKeyFrame: track.isSync(read.sample) && !this.rejected.has(read.sample),
      data: read.bytes,
    };
  }
}

interface PacketReadingParts {
  readonly track: TrackSampleTable;
  readonly open: () => SampleCursor | undefined;
  readonly reject: (sample: number) => void;
  readonly packetOf: (read: CursorSample) => EncodedVideoPacket;
}

/**
 * One iteration over a track's packets, its cursor opened at once so the download reads for it
 * straight away; returning it closes the cursor at once, even while a packet is awaited.
 */
class PacketReading implements AsyncIterator<EncodedVideoPacket> {
  private cursor: SampleCursor | undefined;
  private isVerified = false;
  private readonly ending = new Ending();

  public constructor(private readonly parts: PacketReadingParts) {
    this.cursor = parts.open();
  }

  public async next(): Promise<IteratorResult<EncodedVideoPacket>> {
    if (this.ending.hasEnded()) return ITERATION_END;
    const { cursor } = this;
    if (!cursor)
      throw new GyroViewError('no-key-frame', `track ${this.parts.track.trackId} has no key frame`);
    const read = await cursor.nextSample();
    if (!read || this.ending.hasEnded()) return ITERATION_END;
    if (!this.isVerified && !this.parts.track.keyframeRule.isKeyframe(read.bytes))
      return this.startEarlier(cursor, read);
    this.isVerified = true;
    return { done: false, value: this.parts.packetOf(read) };
  }

  public return(): Promise<IteratorResult<EncodedVideoPacket>> {
    this.ending.end();
    this.cursor?.close();
    return Promise.resolve(ITERATION_END);
  }

  /**
   * The sample decoding was to start at is no keyframe: starts again at the one before it.
   */
  private startEarlier(
    cursor: SampleCursor,
    read: CursorSample,
  ): Promise<IteratorResult<EncodedVideoPacket>> {
    this.parts.reject(read.sample);
    cursor.close();
    this.cursor = this.parts.open();
    return this.next();
  }
}
