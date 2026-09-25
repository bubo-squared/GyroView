import {
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

export interface WebCodecsDecoderOptions {
  /**
   * Default `no-preference`: a hard `prefer-hardware` refuses codecs the browser could decode in
   * software (H.264 proxies on machines without a hardware decoder), and with no preference the
   * browser still picks hardware when it has it (ADR 0010).
   */
  readonly hardwareAcceleration?: HardwareAcceleration;
}

const DEFAULT_HARDWARE_ACCELERATION: HardwareAcceleration = 'no-preference';

/**
 * The error a decoder reported through its callback, shared between the callback and the
 * handle so that later calls fail with the real cause instead of a bare "closed" state.
 */
class ReportedFailure {
  private error: GyroViewError | undefined;

  public get current(): GyroViewError | undefined {
    return this.error;
  }

  public record(error: GyroViewError): void {
    this.error ??= error;
  }
}

/**
 * VideoDecoderPort over the browser's WebCodecs `VideoDecoder`. Frames are exposed as
 * `DecodedFrame<VideoFrame>`; the renderer uploads the handle to the GPU and the pipeline closes
 * it afterwards.
 */
export class WebCodecsVideoDecoderPort implements VideoDecoderPort<VideoFrame> {
  public constructor(private readonly options: WebCodecsDecoderOptions = {}) {}

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
        error instanceof GyroViewError
          ? error
          : new GyroViewError('codec-unsupported', 'the decoder rejected its configuration', {
              cause: error,
            }),
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
    const failure = new ReportedFailure();
    const decoder = new VideoDecoder({
      output: (frame): void => {
        callbacks.onFrame(wrapFrame(frame));
      },
      error: (error): void => {
        const reported = new GyroViewError('decode', `video decoder failed: ${error.message}`, {
          cause: error,
        });
        failure.record(reported);
        callbacks.onError(reported);
      },
    });
    const config = this.toWebCodecsConfig(configuration);
    try {
      decoder.configure(config);
    } catch (error) {
      decoder.close();
      throw error;
    }
    return new WebCodecsDecoderHandle(decoder, config, failure);
  }

  private toWebCodecsConfig(configuration: VideoDecoderConfiguration): VideoDecoderConfig {
    const { description, isFullRange } = configuration;
    return {
      codec: configuration.codec,
      codedWidth: configuration.codedWidth,
      codedHeight: configuration.codedHeight,
      ...(description && { description }),
      ...(isFullRange !== undefined && { colorSpace: { fullRange: isFullRange } }),
      hardwareAcceleration: this.options.hardwareAcceleration ?? DEFAULT_HARDWARE_ACCELERATION,
      optimizeForLatency: false,
    };
  }
}

class WebCodecsDecoderHandle implements VideoDecoderHandle {
  public constructor(
    private readonly decoder: VideoDecoder,
    private readonly config: VideoDecoderConfig,
    private readonly failure: ReportedFailure,
  ) {}

  public get pendingCount(): number {
    return this.decoder.decodeQueueSize;
  }

  /**
   * WebCodecs throws platform exceptions for a packet it refuses (a delta frame first, a closed
   * decoder); they cross the port as `decode` failures, as the fake's do.
   */
  public decode(packet: EncodedVideoPacket): void {
    if (this.failure.current) throw this.failure.current;
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
      throw this.failure.current ?? new GyroViewError('decode', 'flush on a closed decoder');
    }
    try {
      await this.decoder.flush();
    } catch (error) {
      throw (
        this.failure.current ??
        new GyroViewError('decode', 'the decoder could not be flushed', { cause: error })
      );
    }
  }

  /**
   * WebCodecs leaves a reset decoder unconfigured, so the configuration is applied again to
   * keep the port's promise that decoding may continue with a key frame.
   */
  public reset(): void {
    if (this.decoder.state !== 'configured') return;
    this.decoder.reset();
    this.decoder.configure(this.config);
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
