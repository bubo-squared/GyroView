import type { EncodedVideoPacket, VideoDecoderConfiguration } from './VideoTrack';
import type { Seconds } from '../shared/units/time';

/**
 * One decoded picture. The platform object behind it (a WebCodecs `VideoFrame`, a test stub) is
 * opaque to the core; renderers receive the same handle type from the same adapter family.
 */
export interface DecodedFrame<Handle = unknown> {
  readonly timestamp: Seconds;
  readonly handle: Handle;
  /**
   * Releases the decoder memory behind the frame. Every frame must be closed exactly once.
   */
  close(): void;
}

export interface VideoDecoderCallbacks<Handle = unknown> {
  readonly onFrame: (frame: DecodedFrame<Handle>) => void;
  /**
   * The decoder failed and is closed; no further frames will come. Reported once.
   */
  readonly onError: (error: Error) => void;
}

/**
 * One configured decoder instance. Contract (see the shared contract suite in `testing`):
 * the first packet after creation or `reset` must be a key packet and `decode` throws
 * otherwise; `decode` and `flush` fail once the decoder is closed, by `close` or by an error.
 */
export interface VideoDecoderHandle {
  /**
   * Packets submitted that the codec has not taken up yet, what backpressure waits on. A codec
   * may still hold packets it took up without having output their pictures.
   */
  readonly pendingCount: number;
  decode(packet: EncodedVideoPacket): void;
  /**
   * Resolves as soon as fewer than `limit` packets are pending, or at once when the decoder is
   * closed. This is how the pipeline applies backpressure without polling.
   */
  waitForPendingBelow(limit: number): Promise<void>;
  /**
   * Resolves when every submitted packet has produced its frame; rejects if the decoder failed.
   */
  flush(): Promise<void>;
  /**
   * Discards pending packets and decoder state; the next packet must be a key frame.
   */
  reset(): void;
  close(): void;
}

/**
 * Port: creates hardware or software video decoders.
 */
export interface VideoDecoderPort<Handle = unknown> {
  isSupported(configuration: VideoDecoderConfiguration): Promise<boolean>;
  create(
    configuration: VideoDecoderConfiguration,
    callbacks: VideoDecoderCallbacks<Handle>,
  ): Promise<VideoDecoderHandle>;
}
