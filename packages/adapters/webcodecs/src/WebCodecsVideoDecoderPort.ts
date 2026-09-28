import {
  asGyroViewError,
  GyroViewError,
  messageOf,
  microseconds,
  microsecondsToSeconds,
  secondsToMicroseconds,
  type DecodedFrame,
  type EncodedVideoPacket,
  type VideoDecoderCallbacks,
  type VideoDecoderConfiguration,
  type VideoDecoderHandle,
  type VideoDecoderPort,
} from '@gyroview/core';

/**
 * A hard `prefer-hardware` refuses codecs the browser could decode in software (H.264 recordings
 * on machines without a hardware decoder); with no preference the browser still picks hardware
 * when it has it (ADR 0010).
 */
const HARDWARE_ACCELERATION: HardwareAcceleration = 'no-preference';

/**
 * VideoDecoderPort over the browser's WebCodecs `VideoDecoder`. Frames are exposed as
 * `DecodedFrame<VideoFrame>`; the renderer uploads the handle to the GPU and the pipeline closes
 * it afterwards.
 */
export class WebCodecsVideoDecoderPort implements VideoDecoderPort<VideoFrame> {
  /**
   * A configuration WebCodecs finds malformed is one it does not support.
   */
  public async isSupported(configuration: VideoDecoderConfiguration): Promise<boolean> {
    if (typeof VideoDecoder === 'undefined') return false;
    try {
      const support = await VideoDecoder.isConfigSupported(this.toWebCodecsConfig(configuration));
      return support.supported === true;
    } catch {
      return false;
    }
  }

  public create(
    configuration: VideoDecoderConfiguration,
    callbacks: VideoDecoderCallbacks<VideoFrame>,
  ): Promise<VideoDecoderHandle> {
    try {
      return Promise.resolve(this.configureDecoder(configuration, callbacks));
    } catch (error) {
      return Promise.reject(
        asGyroViewError(error, 'codec-unsupported', 'the decoder rejected its configuration'),
      );
    }
  }

  private configureDecoder(
    configuration: VideoDecoderConfiguration,
    callbacks: VideoDecoderCallbacks<VideoFrame>,
  ): VideoDecoderHandle {
    if (typeof VideoDecoder === 'undefined') {
      throw new GyroViewError('codec-unsupported', 'this browser has no WebCodecs VideoDecoder');
    }
    return new WebCodecsDecoderHandle(this.toWebCodecsConfig(configuration), callbacks);
  }

  private toWebCodecsConfig(configuration: VideoDecoderConfiguration): VideoDecoderConfig {
    const { description, isFullRange } = configuration;
    return {
      codec: configuration.codec,
      codedWidth: configuration.codedWidth,
      codedHeight: configuration.codedHeight,
      ...(description && { description }),
      ...(isFullRange !== undefined && { colorSpace: { fullRange: isFullRange } }),
      hardwareAcceleration: HARDWARE_ACCELERATION,
      optimizeForLatency: false,
    };
  }
}

/**
 * One configured `VideoDecoder` for its whole life. The error it reported through its callback
 * is kept, so later calls fail with the real cause instead of a bare "closed" state.
 */
class WebCodecsDecoderHandle implements VideoDecoderHandle {
  private readonly decoder: VideoDecoder;
  private failure: GyroViewError | undefined;

  public constructor(config: VideoDecoderConfig, callbacks: VideoDecoderCallbacks<VideoFrame>) {
    this.decoder = new VideoDecoder({
      output: (frame): void => {
        callbacks.onFrame(wrapFrame(frame));
      },
      error: (error): void => {
        this.failure ??= new GyroViewError('decode', `video decoder failed: ${error.message}`, {
          cause: error,
        });
        callbacks.onError(this.failure);
      },
    });
    try {
      this.decoder.configure(config);
    } catch (error) {
      this.decoder.close();
      throw error;
    }
  }

  public get pendingCount(): number {
    return this.decoder.decodeQueueSize;
  }

  /**
   * WebCodecs throws platform exceptions for a packet it refuses (a delta frame first, a closed
   * decoder); they cross the port as `decode` failures, as the fake's do.
   */
  public decode(packet: EncodedVideoPacket): void {
    if (this.failure) throw this.failure;
    try {
      this.decoder.decode(chunkOf(packet));
    } catch (error) {
      throw new GyroViewError('decode', `the decoder refused a packet: ${messageOf(error)}`, {
        cause: error,
      });
    }
  }

  /**
   * Resolves on the decoder's `dequeue` events until fewer than `limit` packets are pending, or
   * at once when the decoder is no longer configured.
   */
  public waitForPendingBelow(limit: number): Promise<void> {
    return this.decoder.decodeQueueSize < limit
      ? Promise.resolve()
      : new Promise((resolve) => {
          const check = (): void => {
            const isStillBusy =
              this.decoder.decodeQueueSize >= limit && this.decoder.state === 'configured';
            if (isStillBusy) return;
            this.decoder.removeEventListener('dequeue', check);
            resolve();
          };
          this.decoder.addEventListener('dequeue', check);
        });
  }

  public async flush(): Promise<void> {
    if (this.decoder.state !== 'configured') {
      throw this.failure ?? new GyroViewError('decode', 'flush on a closed decoder');
    }
    try {
      await this.decoder.flush();
    } catch (error) {
      throw (
        this.failure ??
        new GyroViewError('decode', 'the decoder could not be flushed', { cause: error })
      );
    }
  }

  public close(): void {
    if (this.decoder.state !== 'closed') this.decoder.close();
  }
}

function chunkOf(packet: EncodedVideoPacket): EncodedVideoChunk {
  return new EncodedVideoChunk({
    type: packet.isKeyFrame ? 'key' : 'delta',
    timestamp: secondsToMicroseconds(packet.timestamp),
    duration: secondsToMicroseconds(packet.duration),
    data: packet.data,
  });
}

function wrapFrame(frame: VideoFrame): DecodedFrame<VideoFrame> {
  return {
    timestamp: microsecondsToSeconds(microseconds(frame.timestamp)),
    handle: frame,
    close: (): void => {
      frame.close();
    },
  };
}
