import type { VideoTrackDescription } from '../ports/VideoTrack';
import type { VideoTrackReader } from '../ports/Demuxer';
import type { EncodedVideoPacket, VideoDecoderConfiguration } from '../ports/VideoTrack';
import { GyroViewError } from '../shared/errors/GyroViewError';
import { seconds, type Seconds } from '../shared/units/time';

export interface FakeVideoTrackOptions {
  readonly trackIndex: number;
  readonly frameRate: number;
  readonly frameCount: number;
  readonly framesPerGop: number;
  readonly codedSize?: number;
  /**
   * Width and height when the frame is not square (a packed dual-fisheye track); default the
   * coded size both ways.
   */
  readonly codedWidth?: number;
  readonly codedHeight?: number;
  readonly codec?: string;
  /**
   * Shifts every timestamp, to simulate tracks that do not start at zero.
   */
  readonly firstTimestamp?: Seconds;
}

const DEFAULT_CODED_SIZE = 2880;
const FAKE_CODEC = 'fake.1';
const BYTE_MASK = 0xff;
const BITS_PER_BYTE = 8;

/**
 * Test double for a container track: `frameCount` packets at `frameRate`, a key frame every
 * `framesPerGop`, each packet's data holding its own frame number so tests can trace it.
 */
export class FakeVideoTrack implements VideoTrackReader {
  public readonly description: VideoTrackDescription;
  private readonly packets: readonly EncodedVideoPacket[];

  public constructor(private readonly options: FakeVideoTrackOptions) {
    this.description = { trackIndex: options.trackIndex, ...codedShapeOf(options) };
    this.packets = Array.from({ length: options.frameCount }, (_unused, frame) =>
      this.packetFor(frame),
    );
  }

  public decoderConfiguration(): Promise<VideoDecoderConfiguration> {
    return Promise.resolve({
      ...codedShapeOf(this.options),
      description: undefined,
      isFullRange: true,
    });
  }

  public keyPacketAt(time: Seconds): Promise<EncodedVideoPacket | undefined> {
    const candidates = this.packets.filter(
      (packet) => packet.isKeyFrame && packet.timestamp <= time,
    );
    return Promise.resolve(candidates.at(-1));
  }

  public async *packetsFrom(start: EncodedVideoPacket): AsyncIterable<EncodedVideoPacket> {
    const index = this.packets.indexOf(start);
    if (index === -1) {
      throw new GyroViewError(
        'invariant-violation',
        'packetsFrom needs a packet handed out by this track',
      );
    }
    for (const packet of this.packets.slice(index)) {
      await Promise.resolve();
      yield packet;
    }
  }

  public sampleTimestamps(): Promise<readonly Seconds[]> {
    return Promise.resolve(this.packets.map((packet) => packet.timestamp));
  }

  public frameCount(): Promise<number> {
    return Promise.resolve(this.options.frameCount);
  }

  private packetFor(frame: number): EncodedVideoPacket {
    const { frameRate, framesPerGop, firstTimestamp } = this.options;
    return {
      timestamp: seconds((firstTimestamp ?? 0) + frame / frameRate),
      duration: seconds(1 / frameRate),
      isKeyFrame: frame % framesPerGop === 0,
      data: Uint8Array.from([frame & BYTE_MASK, (frame >>> BITS_PER_BYTE) & BYTE_MASK]),
    };
  }
}

function codedShapeOf(
  options: FakeVideoTrackOptions,
): Pick<VideoTrackDescription, 'codedWidth' | 'codedHeight' | 'codec'> {
  const size = options.codedSize ?? DEFAULT_CODED_SIZE;
  return {
    codedWidth: options.codedWidth ?? size,
    codedHeight: options.codedHeight ?? size,
    codec: options.codec ?? FAKE_CODEC,
  };
}

/**
 * The frame number a {@link FakeVideoTrack} packet or its decoded frame carries.
 */
export function fakeFrameNumberOf(data: Uint8Array): number {
  return (data[0] ?? 0) | ((data[1] ?? 0) << BITS_PER_BYTE);
}
