import type { EncodedVideoPacket, VideoDecoderConfiguration } from './Demuxer';
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
  readonly onError: (error: Error) => void;
}

/**
 * One configured decoder instance.
 */
export interface VideoDecoderHandle {
  /**
   * Packets submitted but not yet output.
   */
  readonly pendingCount: number;
  decode(packet: EncodedVideoPacket): void;
  /**
   * Resolves as soon as fewer than `limit` packets are pending. This is how the pipeline applies
   * backpressure without polling.
   */
  waitForPendingBelow(limit: number): Promise<void>;
  /**
   * Resolves when every submitted packet has produced its frame.
   */
  flush(): Promise<void>;
  /**
   * Discards pending packets and decoder state; the next packet must be a key frame.
   */
  reset(): void;
  close(): void;
}

/**
 * Port: creates hardware or software video decoders. Implemented by the WebCodecs adapter.
 */
export interface VideoDecoderPort<Handle = unknown> {
  isSupported(configuration: VideoDecoderConfiguration): Promise<boolean>;
  create(
    configuration: VideoDecoderConfiguration,
    callbacks: VideoDecoderCallbacks<Handle>,
  ): Promise<VideoDecoderHandle>;
}
