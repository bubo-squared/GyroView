import type { VideoTrackDescription } from '../../ports/VideoTrack';
import type { VideoTrackReader } from '../../ports/Demuxer';
import type { EncodedVideoPacket, VideoDecoderConfiguration } from '../../ports/VideoTrack';
import type { VideoDecoderHandle, VideoDecoderPort } from '../../ports/VideoDecoderPort';
import { Deferred } from '../../shared/async/Deferred';
import type { Signal } from '../../shared/async/Signal';
import { hasErrorCode, messageOf } from '../../shared/errors/GyroViewError';

export type ProbeVerdict =
  | 'decodes'
  | 'unsupported-configuration'
  | 'no-key-frame'
  | 'key-frame-late'
  | 'decode-failed'
  | 'timed-out';

export interface SourceProbeResult {
  readonly track: VideoTrackDescription;
  readonly verdict: ProbeVerdict;
  /**
   * What went wrong, worded for the message shown to the embedder.
   */
  readonly detail: string | undefined;
}

export interface DecodeProbeReport {
  /**
   * True when every frame source decoded its first key frame.
   */
  readonly canDecode: boolean;
  readonly sources: readonly SourceProbeResult[];
}

type Outcome = Pick<SourceProbeResult, 'verdict' | 'detail'>;

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
const KEY_FRAME_LATE: Outcome = {
  verdict: 'key-frame-late',
  detail: 'the first key frame did not arrive before the deadline',
};

/**
 * Use case: find out before playback whether this platform decodes the recording, by decoding
 * the first key frame of every frame source. The decoder port's `isSupported` alone is not
 * trusted: platforms answer yes and then fail, and hardware decoders can stall, hence the real
 * decode under a deadline. The host triggers `deadline` once the probe has taken too long (the
 * core has no timers); sources still undecided then report `timed-out`, or `key-frame-late`
 * while their key frame was still being read, and their decoders are closed. A track that cannot be read rejects the probe with its own failure, and the other
 * sources' decoders are closed then, not at the deadline.
 */
export async function probeDecoding<Handle>(
  frameSources: readonly VideoTrackReader[],
  decoderPort: VideoDecoderPort<Handle>,
  deadline: Signal,
): Promise<DecodeProbeReport> {
  const probes = frameSources.map((track) => new SourceProbe(track, decoderPort));
  try {
    const sources = await Promise.all(probes.map((probe) => probeFrameSource(probe, deadline)));
    return { canDecode: sources.every((source) => source.verdict === 'decodes'), sources };
  } finally {
    for (const probe of probes) probe.close();
  }
}

async function probeFrameSource<Handle>(
  probe: SourceProbe<Handle>,
  deadline: Signal,
): Promise<SourceProbeResult> {
  try {
    const outcome = await Promise.race([probe.run(), afterDeadline(deadline, probe)]);
    return { track: probe.track.description, ...outcome };
  } finally {
    probe.close();
  }
}

async function afterDeadline<Handle>(
  deadline: Signal,
  probe: SourceProbe<Handle>,
): Promise<Outcome> {
  await deadline.promise;
  return probe.outcomeAtDeadline;
}

/**
 * One frame source's probe: owns the decoder it opens so a deadline can close it from outside.
 */
class SourceProbe<Handle> {
  private decoder: VideoDecoderHandle | undefined;
  private isClosed = false;
  private isReadingKeyFrame = false;

  public constructor(
    public readonly track: VideoTrackReader,
    private readonly decoderPort: VideoDecoderPort<Handle>,
  ) {}

  /**
   * What a deadline passing now says: the network did not bring the key frame in time, or the
   * platform did not answer or decode it in time.
   */
  public get outcomeAtDeadline(): Outcome {
    return this.isReadingKeyFrame ? KEY_FRAME_LATE : TIMED_OUT;
  }

  /**
   * The decoder's answers make the verdict; a failure to read the track rejects as it is, since
   * a connection that dropped is no codec's fault. A probe closed meanwhile reads no key frame and
   * opens no decoder: decoders are few on some platforms, and the next load may need them.
   */
  public async run(): Promise<Outcome> {
    const configuration = await this.track.decoderConfiguration();
    if (!(await this.decoderPort.isSupported(configuration))) return unsupported(configuration);
    if (this.isClosed) return TIMED_OUT;
    this.isReadingKeyFrame = true;
    const keyPacket = await this.track.firstKeyPacket();
    this.isReadingKeyFrame = false;
    return keyPacket ? await this.decodeFirst(configuration, keyPacket) : NO_KEY_FRAME;
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
    if (this.isClosed) return TIMED_OUT;
    const first = new Deferred<Outcome>();
    const decoder = await this.openDecoder(configuration, first);
    if (decoder === undefined) return first.promise;
    this.decoder = decoder;
    void this.decodeInto(decoder, keyPacket, first);
    return first.promise;
  }

  /**
   * A decoder that reports into `first`; undefined, the outcome reported there, when the port
   * refuses one or the probe was closed while it was being made.
   */
  private async openDecoder(
    configuration: VideoDecoderConfiguration,
    first: Deferred<Outcome>,
  ): Promise<VideoDecoderHandle | undefined> {
    try {
      const decoder = await this.decoderPort.create(configuration, {
        onFrame: (frame): void => {
          frame.close();
          first.resolve(DECODES);
        },
        onError: (error): void => {
          first.resolve(failedWith(error));
        },
      });
      if (!this.isClosed) return decoder;
      decoder.close();
      first.resolve(TIMED_OUT);
    } catch (error) {
      first.resolve(failedWith(error));
    }
    return undefined;
  }

  /**
   * Decodes the key frame and forces its picture out of decoders that buffer. A decoder that
   * refuses the packet (one that is no real key frame), or a flush that ends without a picture,
   * is a failure.
   */
  private async decodeInto(
    decoder: VideoDecoderHandle,
    keyPacket: EncodedVideoPacket,
    first: Deferred<Outcome>,
  ): Promise<void> {
    try {
      decoder.decode(keyPacket);
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
  const isUnsupported = hasErrorCode(error, 'codec-unsupported');
  return {
    verdict: isUnsupported ? 'unsupported-configuration' : 'decode-failed',
    detail: message,
  };
}
