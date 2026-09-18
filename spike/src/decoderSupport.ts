// Asks the browser whether it can decode a track's configuration, three different ways.

export interface DecoderSupport {
  preferHardware: boolean;
  preferSoftware: boolean;
  mediaCapabilities:
    { supported: boolean; smooth: boolean; powerEfficient: boolean } | { error: string };
}

export async function probeDecoderSupport(
  config: VideoDecoderConfig,
  options: { codecString: string; bitrate: number; framerate: number },
): Promise<DecoderSupport> {
  const [hardware, software] = await Promise.all([
    VideoDecoder.isConfigSupported({ ...config, hardwareAcceleration: 'prefer-hardware' }),
    VideoDecoder.isConfigSupported({ ...config, hardwareAcceleration: 'prefer-software' }),
  ]);
  return {
    preferHardware: hardware.supported === true,
    preferSoftware: software.supported === true,
    mediaCapabilities: await queryMediaCapabilities(config, options),
  };
}

async function queryMediaCapabilities(
  config: VideoDecoderConfig,
  options: { codecString: string; bitrate: number; framerate: number },
): Promise<DecoderSupport['mediaCapabilities']> {
  try {
    const info = await navigator.mediaCapabilities.decodingInfo({
      type: 'file',
      video: {
        contentType: `video/mp4; codecs="${options.codecString}"`,
        width: config.codedWidth ?? 0,
        height: config.codedHeight ?? 0,
        bitrate: options.bitrate,
        framerate: options.framerate,
      },
    });
    return { supported: info.supported, smooth: info.smooth, powerEfficient: info.powerEfficient };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
