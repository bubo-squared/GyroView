import type { EncodedVideoPacket, VideoDecoderConfiguration } from '../ports/Demuxer';
import type {
  DecodedFrame,
  VideoDecoderCallbacks,
  VideoDecoderHandle,
  VideoDecoderPort,
} from '../ports/VideoDecoderPort';

/**
 * What the fake decoder hands out: enough to trace a frame back to its packet and to assert that
 * every frame is closed exactly once.
 */
export interface FakeFrameHandle {
  readonly lensCodec: string;
  readonly packetData: Uint8Array;
  readonly isClosed: () => boolean;
}

export interface FakeDecoderOptions {
  /**
   * Microtask hops between `decode` and the frame callback; frames always arrive asynchronously.
   */
  readonly latencyTicks?: number;
  readonly unsupportedCodecs?: readonly string[];
}

interface PendingWaiter {
  readonly limit: number;
  readonly resolve: () => void;
}

interface FakeVideoDecoderParts {
  readonly configuration: VideoDecoderConfiguration;
  readonly callbacks: VideoDecoderCallbacks<FakeFrameHandle>;
  readonly latencyTicks: number;
  readonly onFrameCreated: (frame: DecodedFrame<FakeFrameHandle>) => void;
}

const DEFAULT_LATENCY_TICKS = 1;

/**
 * Test double for the decoder port: frames come out asynchronously in submission order, and the
 * double keeps every frame it made so tests can check for leaks. Scheduling uses microtasks
 * only, so it runs wherever the core runs.
 */
export class FakeVideoDecoderPort implements VideoDecoderPort<FakeFrameHandle> {
  public readonly framesCreated: DecodedFrame<FakeFrameHandle>[] = [];
  public readonly decodersCreated: FakeVideoDecoder[] = [];

  public constructor(private readonly options: FakeDecoderOptions = {}) {}

  public get openFrames(): number {
    return this.framesCreated.filter((frame) => !frame.handle.isClosed()).length;
  }

  public isSupported(configuration: VideoDecoderConfiguration): Promise<boolean> {
    return Promise.resolve(!(this.options.unsupportedCodecs ?? []).includes(configuration.codec));
  }

  public create(
    configuration: VideoDecoderConfiguration,
    callbacks: VideoDecoderCallbacks<FakeFrameHandle>,
  ): Promise<VideoDecoderHandle> {
    const decoder = new FakeVideoDecoder({
      configuration,
      callbacks,
      latencyTicks: this.options.latencyTicks ?? DEFAULT_LATENCY_TICKS,
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
  private generation = 0;
  private waiters: PendingWaiter[] = [];
  private isClosedNow = false;

  public constructor(private readonly parts: FakeVideoDecoderParts) {}

  public get pendingCount(): number {
    return this.pending;
  }

  public get isClosed(): boolean {
    return this.isClosedNow;
  }

  public decode(packet: EncodedVideoPacket): void {
    this.pending += 1;
    this.maxPendingSeen = Math.max(this.maxPendingSeen, this.pending);
    const generation = this.generation;
    void afterTicks(this.parts.latencyTicks).then(() => {
      if (generation !== this.generation) return;
      this.pending -= 1;
      const frame = this.frameFor(packet);
      this.parts.onFrameCreated(frame);
      this.parts.callbacks.onFrame(frame);
      this.notifyWaiters();
    });
  }

  public waitForPendingBelow(limit: number): Promise<void> {
    return this.pending < limit
      ? Promise.resolve()
      : new Promise((resolve) => {
          this.waiters.push({ limit, resolve });
        });
  }

  public flush(): Promise<void> {
    return this.waitForPendingBelow(1);
  }

  public reset(): void {
    this.generation += 1;
    this.pending = 0;
    this.notifyWaiters();
  }

  public close(): void {
    this.reset();
    this.isClosedNow = true;
  }

  private notifyWaiters(): void {
    const stillWaiting: PendingWaiter[] = [];
    for (const waiter of this.waiters) {
      if (this.pending < waiter.limit) waiter.resolve();
      else stillWaiting.push(waiter);
    }
    this.waiters = stillWaiting;
  }

  private frameFor(packet: EncodedVideoPacket): DecodedFrame<FakeFrameHandle> {
    let isClosed = false;
    return {
      timestamp: packet.timestamp,
      handle: {
        lensCodec: this.parts.configuration.codec,
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
