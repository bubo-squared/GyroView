import type { VideoTrackDescription } from '../../domain/format/layout/VideoTrackDescription';
import type {
  EncodedVideoPacket,
  VideoDecoderConfiguration,
  VideoTrackReader,
} from '../../ports/Demuxer';
import type { VideoDecoderHandle, VideoDecoderPort } from '../../ports/VideoDecoderPort';
import { Deferred } from '../../shared/async/Deferred';
import type { Signal } from '../../shared/async/Signal';
import { GyroViewError, messageOf } from '../../shared/errors/GyroViewError';
import { seconds } from '../../shared/units/time';

export type LensProbeVerdict =
  'decodes' | 'unsupported-configuration' | 'no-key-frame' | 'decode-failed' | 'timed-out';

export interface LensProbeResult {
  readonly track: VideoTrackDescription;
  readonly verdict: LensProbeVerdict;
  /**
   * What went wrong, worded for the message shown to the embedder.
   */
  readonly detail: string | undefined;
}

export interface DecodeProbeReport {
  /**
   * True when every lens track decoded its first key frame.
   */
  readonly canDecode: boolean;
  readonly lenses: readonly LensProbeResult[];
}

export interface DecodeProbeOptions {
  /**
   * Triggered by the host once the probe has taken too long (the core has no timers). Lenses
   * still undecided then report `timed-out` and their decoders are closed.
   */
  readonly deadline: Signal;
}

type Outcome = Pick<LensProbeResult, 'verdict' | 'detail'>;

const DECODES: Outcome = { verdict: 'decodes', detail: undefined };
const NO_KEY_FRAME: Outcome = { verdict: 'no-key-frame', detail: 'the track has no key frame' };
const NO_FRAME_OUT: Outcome = {
  verdict: 'decode-failed',
  detail: 'the decoder accepted the first key frame but produced no picture',
};
const TIMED_OUT: Outcome = {
  verdict: 'timed-out',
  detail: 'the decoder produced no picture before the deadline',
};

/**
 * Use case: find out before playback whether this platform decodes the recording, by decoding
 * the first key frame of every lens track. The decoder port's `isSupported` alone is not
 * trusted: platforms answer yes and then fail, and hardware decoders can stall, hence the real
 * decode under a deadline.
 */
export async function probeDecoding<Handle>(
  lensTracks: readonly VideoTrackReader[],
  decoderPort: VideoDecoderPort<Handle>,
  options: DecodeProbeOptions,
): Promise<DecodeProbeReport> {
  const lenses = await Promise.all(
    lensTracks.map((track) => probeLens(track, decoderPort, options.deadline)),
  );
  return { canDecode: lenses.every((lens) => lens.verdict === 'decodes'), lenses };
}

async function probeLens<Handle>(
  track: VideoTrackReader,
  decoderPort: VideoDecoderPort<Handle>,
  deadline: Signal,
): Promise<LensProbeResult> {
  const probe = new LensProbe(track, decoderPort);
  try {
    const outcome = await Promise.race([probe.run(), afterDeadline(deadline)]);
    return { track: track.description, ...outcome };
  } finally {
    probe.close();
  }
}

async function afterDeadline(deadline: Signal): Promise<Outcome> {
  await deadline.promise;
  return TIMED_OUT;
}

/**
 * One lens track's probe: owns the decoder it opens so a deadline can close it from outside.
 */
class LensProbe<Handle> {
  private decoder: VideoDecoderHandle | undefined;
  private isClosed = false;

  public constructor(
    private readonly track: VideoTrackReader,
    private readonly decoderPort: VideoDecoderPort<Handle>,
  ) {}

  public async run(): Promise<Outcome> {
    try {
      const configuration = await this.track.decoderConfiguration();
      if (!(await this.decoderPort.isSupported(configuration))) return unsupported(configuration);
      const keyPacket = await this.track.keyPacketAt(seconds(0));
      return keyPacket ? await this.decodeFirst(configuration, keyPacket) : NO_KEY_FRAME;
    } catch (error) {
      return failedWith(error);
    }
  }

  public close(): void {
    this.isClosed = true;
    this.decoder?.close();
    this.decoder = undefined;
  }

  private async decodeFirst(
    configuration: VideoDecoderConfiguration,
    keyPacket: EncodedVideoPacket,
  ): Promise<Outcome> {
    const first = new Deferred<Outcome>();
    const decoder = await this.decoderPort.create(configuration, {
      onFrame: (frame): void => {
        frame.close();
        first.resolve(DECODES);
      },
      onError: (error): void => {
        first.resolve(failedWith(error));
      },
    });
    if (this.isClosed) {
      decoder.close();
      return TIMED_OUT;
    }
    this.decoder = decoder;
    decoder.decode(keyPacket);
    void this.flushInto(decoder, first);
    return first.promise;
  }

  /**
   * Forces the picture out of decoders that buffer; a flush that ends without one is a failure.
   */
  private async flushInto(decoder: VideoDecoderHandle, first: Deferred<Outcome>): Promise<void> {
    try {
      await decoder.flush();
      first.resolve(NO_FRAME_OUT);
    } catch (error) {
      first.resolve(failedWith(error));
    }
  }
}

function unsupported(configuration: VideoDecoderConfiguration): Outcome {
  return {
    verdict: 'unsupported-configuration',
    detail: `${configuration.codec} at ${configuration.codedWidth}x${configuration.codedHeight} is not supported here`,
  };
}

function failedWith(error: unknown): Outcome {
  const message = messageOf(error);
  const isUnsupported = error instanceof GyroViewError && error.code === 'codec-unsupported';
  return {
    verdict: isUnsupported ? 'unsupported-configuration' : 'decode-failed',
    detail: message,
  };
}
