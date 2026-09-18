import {
  GyroViewError,
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

export type HardwarePreference = 'prefer-hardware' | 'prefer-software' | 'no-preference';

export interface WebCodecsDecoderOptions {
  readonly hardwareAcceleration?: HardwarePreference;
}

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

  public async isSupported(configuration: VideoDecoderConfiguration): Promise<boolean> {
    if (typeof VideoDecoder === 'undefined') return false;
    const support = await VideoDecoder.isConfigSupported(this.toWebCodecsConfig(configuration));
    return support.supported === true;
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
      hardwareAcceleration: this.options.hardwareAcceleration ?? 'prefer-hardware',
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

  public decode(packet: EncodedVideoPacket): void {
    if (this.failure.current) throw this.failure.current;
    this.decoder.decode(
      new EncodedVideoChunk({
        type: packet.isKeyFrame ? 'key' : 'delta',
        timestamp: secondsToMicroseconds(packet.timestamp),
        duration: secondsToMicroseconds(packet.duration),
        data: packet.data,
      }),
    );
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

function wrapFrame(frame: VideoFrame): DecodedFrame<VideoFrame> {
  return {
    timestamp: microsecondsToSeconds(microseconds(frame.timestamp)),
    handle: frame,
    close: (): void => {
      frame.close();
    },
  };
}
