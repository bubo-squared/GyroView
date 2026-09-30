import type { VideoTrackDescription } from '../ports/VideoTrack';
import { ITERATION_END } from '../shared/async/iteration';
import type { VideoTrackReader } from '../ports/VideoTrackReader';
import type {
  EncodedVideoPacket,
  KeyframeTime,
  VideoDecoderConfiguration,
} from '../ports/VideoTrack';
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
  /**
   * Packet iterations under way: started and neither finished nor returned.
   */
  public openReadings = 0;
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

  public keyframeAt(time: Seconds): Promise<KeyframeTime | undefined> {
    return Promise.resolve(timeOf(this.keyPacketAtOrBefore(time)));
  }

  public firstKeyframe(): Promise<KeyframeTime | undefined> {
    return Promise.resolve(timeOf(this.firstKeyPacket()));
  }

  public packetsFrom(time: Seconds): AsyncIterable<EncodedVideoPacket> {
    return {
      [Symbol.asyncIterator]: (): AsyncIterator<EncodedVideoPacket> => this.readingAt(time),
    };
  }

  public sampleTimestamps(): Promise<readonly Seconds[]> {
    return Promise.resolve(this.packets.map((packet) => packet.timestamp));
  }

  public frameCount(): Promise<number> {
    return Promise.resolve(this.options.frameCount);
  }

  private keyPacketAtOrBefore(time: Seconds): EncodedVideoPacket | undefined {
    return this.packets.findLast((packet) => packet.isKeyFrame && packet.timestamp <= time);
  }

  private firstKeyPacket(): EncodedVideoPacket | undefined {
    return this.packets.find((packet) => packet.isKeyFrame);
  }

  private readingAt(time: Seconds): FakePacketReading {
    const start = this.keyPacketAtOrBefore(time) ?? this.firstKeyPacket();
    this.openReadings += 1;
    const onClose = (): void => {
      this.openReadings -= 1;
    };
    return new FakePacketReading(
      start ? this.packets.slice(this.packets.indexOf(start)) : undefined,
      onClose,
    );
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
 * One iteration over the fake's packets, each a turn after it is asked for, as a read would come.
 * Without packets to start from, as on a track without a key frame, it fails as a reader must.
 */
class FakePacketReading implements AsyncIterator<EncodedVideoPacket> {
  private position = 0;
  private isOpen = true;

  public constructor(
    private readonly packets: readonly EncodedVideoPacket[] | undefined,
    private readonly onClose: () => void,
  ) {}

  public async next(): Promise<IteratorResult<EncodedVideoPacket>> {
    await Promise.resolve();
    if (!this.packets) {
      this.close();
      throw new GyroViewError('no-key-frame', 'the fake track has no key frame');
    }
    const packet = this.isOpen ? this.packets[this.position] : undefined;
    if (!packet) return this.close();
    this.position += 1;
    return { done: false, value: packet };
  }

  public return(): Promise<IteratorResult<EncodedVideoPacket>> {
    return Promise.resolve(this.close());
  }

  private close(): IteratorReturnResult<undefined> {
    if (this.isOpen) this.onClose();
    this.isOpen = false;
    return ITERATION_END;
  }
}

function timeOf(packet: EncodedVideoPacket | undefined): KeyframeTime | undefined {
  return packet && { timestamp: packet.timestamp, duration: packet.duration };
}

/**
 * The frame number a {@link FakeVideoTrack} packet or its decoded frame carries.
 */
export function fakeFrameNumberOf(data: Uint8Array): number {
  return (data[0] ?? 0) | ((data[1] ?? 0) << BITS_PER_BYTE);
}
