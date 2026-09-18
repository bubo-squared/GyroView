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
 * VideoDecoderPort over the browser's WebCodecs `VideoDecoder`. Frames are exposed as
 * `DecodedFrame<VideoFrame>`; the renderer adapter uploads the handle to the GPU and the
 * pipeline closes it afterwards.
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
    if (typeof VideoDecoder === 'undefined') {
      return Promise.reject(
        new GyroViewError('codec-unsupported', 'this browser has no WebCodecs VideoDecoder'),
      );
    }
    const decoder = new VideoDecoder({
      output: (frame): void => {
        callbacks.onFrame(wrapFrame(frame));
      },
      error: (error): void => {
        callbacks.onError(
          new GyroViewError('decode', `video decoder failed: ${error.message}`, { cause: error }),
        );
      },
    });
    decoder.configure(this.toWebCodecsConfig(configuration));
    return Promise.resolve(new WebCodecsDecoderHandle(decoder));
  }

  private toWebCodecsConfig(configuration: VideoDecoderConfiguration): VideoDecoderConfig {
    const { description } = configuration;
    return {
      codec: configuration.codec,
      codedWidth: configuration.codedWidth,
      codedHeight: configuration.codedHeight,
      ...(description && { description }),
      hardwareAcceleration: this.options.hardwareAcceleration ?? 'prefer-hardware',
      optimizeForLatency: false,
    };
  }
}

class WebCodecsDecoderHandle implements VideoDecoderHandle {
  public constructor(private readonly decoder: VideoDecoder) {}

  public get pendingCount(): number {
    return this.decoder.decodeQueueSize;
  }

  public decode(packet: EncodedVideoPacket): void {
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
   * Resolves on the decoder's `dequeue` events until fewer than `limit` packets are pending.
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

  public flush(): Promise<void> {
    return this.decoder.state === 'configured' ? this.decoder.flush() : Promise.resolve();
  }

  public reset(): void {
    if (this.decoder.state === 'configured') this.decoder.reset();
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
