import type { EncodedVideoPacket, VideoDecoderConfiguration } from '../ports/VideoTrack';
import type {
  DecodedFrame,
  VideoDecoderCallbacks,
  VideoDecoderHandle,
  VideoDecoderPort,
} from '../ports/VideoDecoderPort';
import { GyroViewError } from '../shared/errors/GyroViewError';

/**
 * What the fake decoder hands out: enough to trace a frame back to its packet and to assert that
 * every frame is closed exactly once.
 */
export interface FakeFrameHandle {
  readonly packetData: Uint8Array;
  readonly isClosed: () => boolean;
}

export interface FakeDecoderOptions {
  /**
   * Microtask hops between `decode` and the frame callback; frames always arrive asynchronously.
   */
  readonly latencyTicks?: number;
  readonly unsupportedCodecs?: readonly string[];
  /**
   * Reject `create` for unsupported codecs with a codec-unsupported error, like a real port.
   */
  readonly failOnCreate?: boolean;
  /**
   * The ordinal (1-based) of the packet at which every decoder reports an error instead of a
   * picture and closes itself, like a decoder meeting a broken bitstream.
   */
  readonly failAtPacket?: number;
}

interface PendingWaiter {
  readonly limit: number;
  readonly resolve: () => void;
}

interface FakeVideoDecoderParts {
  readonly configuration: VideoDecoderConfiguration;
  readonly callbacks: VideoDecoderCallbacks<FakeFrameHandle>;
  readonly latencyTicks: number;
  readonly failAtPacket: number | undefined;
  readonly onFrameCreated: (frame: DecodedFrame<FakeFrameHandle>) => void;
}

const DEFAULT_LATENCY_TICKS = 1;

/**
 * Test double for the decoder port: frames come out asynchronously in submission order, and the
 * double keeps every frame it made so tests can check for leaks. It enforces the port contract
 * (key frame first, nothing after close) as strictly as a platform decoder. Scheduling uses
 * microtasks only, so it runs wherever the core runs.
 */
export class FakeVideoDecoderPort implements VideoDecoderPort<FakeFrameHandle> {
  public readonly framesCreated: DecodedFrame<FakeFrameHandle>[] = [];
  public readonly decodersCreated: FakeVideoDecoder[] = [];

  public constructor(private readonly options: FakeDecoderOptions = {}) {}

  public get openFrames(): number {
    return this.framesCreated.filter((frame) => !frame.handle.isClosed()).length;
  }

  public get openDecoders(): number {
    return this.decodersCreated.filter((decoder) => !decoder.isClosed).length;
  }

  public isSupported(configuration: VideoDecoderConfiguration): Promise<boolean> {
    return Promise.resolve(!(this.options.unsupportedCodecs ?? []).includes(configuration.codec));
  }

  public create(
    configuration: VideoDecoderConfiguration,
    callbacks: VideoDecoderCallbacks<FakeFrameHandle>,
  ): Promise<VideoDecoderHandle> {
    if (
      this.options.failOnCreate &&
      (this.options.unsupportedCodecs ?? []).includes(configuration.codec)
    ) {
      return Promise.reject(
        new GyroViewError('codec-unsupported', `${configuration.codec} cannot be decoded`),
      );
    }
    const decoder = new FakeVideoDecoder({
      configuration,
      callbacks,
      latencyTicks: this.options.latencyTicks ?? DEFAULT_LATENCY_TICKS,
      failAtPacket: this.options.failAtPacket,
      onFrameCreated: (frame): void => {
        this.framesCreated.push(frame);
      },
    });
    this.decodersCreated.push(decoder);
    return Promise.resolve(decoder);
  }
}

export class FakeVideoDecoder implements VideoDecoderHandle {
  public maxPendingSeen = 0;
  private pending = 0;
  private decodedCount = 0;
  private needsKeyFrame = true;
  private waiters: PendingWaiter[] = [];
  private isClosedNow = false;
  private failure: Error | undefined;

  public constructor(private readonly parts: FakeVideoDecoderParts) {}

  public get pendingCount(): number {
    return this.pending;
  }

  public get isClosed(): boolean {
    return this.isClosedNow;
  }

  public decode(packet: EncodedVideoPacket): void {
    if (this.isClosedNow) throw new GyroViewError('decode', 'decode on a closed decoder');
    if (this.needsKeyFrame && !packet.isKeyFrame) {
      throw new GyroViewError('decode', 'the first packet after creation must be a key frame');
    }
    this.needsKeyFrame = false;
    this.decodedCount += 1;
    this.pending += 1;
    this.maxPendingSeen = Math.max(this.maxPendingSeen, this.pending);
    const ordinal = this.decodedCount;
    void afterTicks(this.parts.latencyTicks).then(() => {
      if (!this.isClosedNow) this.output(packet, ordinal);
    });
  }

  public waitForPendingBelow(limit: number): Promise<void> {
    return this.pending < limit || this.isClosedNow
      ? Promise.resolve()
      : new Promise((resolve) => {
          this.waiters.push({ limit, resolve });
        });
  }

  public async flush(): Promise<void> {
    if (this.isClosedNow)
      throw this.failure ?? new GyroViewError('decode', 'flush on a closed decoder');
    await this.waitForPendingBelow(1);
    if (this.failure) throw this.failure;
  }

  public close(): void {
    this.isClosedNow = true;
    this.discardPending();
  }

  private output(packet: EncodedVideoPacket, ordinal: number): void {
    this.pending -= 1;
    if (ordinal === this.parts.failAtPacket) {
      this.failWith(new GyroViewError('decode', `fake decoder failed at packet ${ordinal}`));
      return;
    }
    const frame = this.frameFor(packet);
    this.parts.onFrameCreated(frame);
    this.parts.callbacks.onFrame(frame);
    this.notifyWaiters();
  }

  /**
   * Like a platform decoder: the error closes the decoder, then the callback hears about it.
   */
  private failWith(error: Error): void {
    this.failure = error;
    this.isClosedNow = true;
    this.discardPending();
    this.parts.callbacks.onError(error);
  }

  /**
   * A closed decoder outputs nothing more: what was pending is dropped and its waiters let go.
   */
  private discardPending(): void {
    this.pending = 0;
    this.notifyWaiters();
  }

  private notifyWaiters(): void {
    const stillWaiting: PendingWaiter[] = [];
    for (const waiter of this.waiters) {
      if (this.pending < waiter.limit || this.isClosedNow) waiter.resolve();
      else stillWaiting.push(waiter);
    }
    this.waiters = stillWaiting;
  }

  private frameFor(packet: EncodedVideoPacket): DecodedFrame<FakeFrameHandle> {
    let isClosed = false;
    return {
      timestamp: packet.timestamp,
      handle: {
        packetData: packet.data,
        isClosed: (): boolean => isClosed,
      },
      close: (): void => {
        isClosed = true;
      },
    };
  }
}

async function afterTicks(ticks: number): Promise<void> {
  for (let tick = 0; tick < ticks; tick += 1) await Promise.resolve();
}
