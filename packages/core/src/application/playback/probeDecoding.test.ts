import { describe, expect, it } from 'vitest';

import { probeDecoding } from './probeDecoding';
import type { EncodedVideoPacket, VideoDecoderConfiguration } from '../../ports/VideoTrack';
import type {
  VideoDecoderCallbacks,
  VideoDecoderHandle,
  VideoDecoderPort,
} from '../../ports/VideoDecoderPort';
import { Deferred } from '../../shared/async/Deferred';
import { GyroViewError } from '../../shared/errors/GyroViewError';
import { seconds } from '../../shared/units/time';
import { FakeVideoDecoderPort } from '../../testing/FakeVideoDecoderPort';
import { FakeVideoTrack } from '../../testing/FakeVideoTrack';
import { settle } from '../../../test/support/settle';

function tracks(frameCounts: readonly number[]): FakeVideoTrack[] {
  return frameCounts.map(
    (frameCount, trackIndex) =>
      new FakeVideoTrack({ trackIndex, frameRate: 30, frameCount, framesPerGop: 30 }),
  );
}

/**
 * A promise that never settles, standing in for a decoder that never answers.
 */
function forever(): Promise<void> {
  return new Promise(() => {
    // never settled on purpose
  });
}

/**
 * A decoder that accepts packets and never produces a picture, like a stalled hardware decoder.
 */
class StalledDecoder implements VideoDecoderHandle {
  public isClosed = false;
  public packetsAccepted = 0;

  public get pendingCount(): number {
    return this.packetsAccepted;
  }

  public decode(): void {
    this.packetsAccepted += 1;
  }

  public waitForPendingBelow(): Promise<void> {
    return forever();
  }

  public flush(): Promise<void> {
    return forever();
  }

  public close(): void {
    this.isClosed = true;
  }
}

class StalledPort implements VideoDecoderPort<never> {
  public readonly decoders: StalledDecoder[] = [];

  public isSupported(): Promise<boolean> {
    return Promise.resolve(true);
  }

  public create(): Promise<VideoDecoderHandle> {
    const decoder = new StalledDecoder();
    this.decoders.push(decoder);
    return Promise.resolve(decoder);
  }
}

/**
 * A track whose video data cannot be read, as over a connection that dropped.
 */
class UnreadableTrack extends FakeVideoTrack {
  public override firstKeyPacket(): Promise<EncodedVideoPacket | undefined> {
    return Promise.reject(new GyroViewError('source-unreadable', 'the connection dropped'));
  }
}

/**
 * A track that counts its key frame reads, each answered once its gate opens, as over a slow link.
 */
class GatedTrack extends FakeVideoTrack {
  public readonly keyFrameGate = new Deferred<void>();
  public keyFrameReads = 0;

  public override async firstKeyPacket(): Promise<EncodedVideoPacket | undefined> {
    this.keyFrameReads += 1;
    await this.keyFrameGate.promise;
    return super.firstKeyPacket();
  }
}

function gatedTrack(): GatedTrack {
  return new GatedTrack({ trackIndex: 0, frameRate: 30, frameCount: 30, framesPerGop: 30 });
}

class RefusingPort implements VideoDecoderPort<never> {
  public constructor(private readonly error: Error) {}

  public isSupported(): Promise<boolean> {
    return Promise.resolve(true);
  }

  public create(): Promise<VideoDecoderHandle> {
    return Promise.reject(this.error);
  }
}

/**
 * A decoder that reports an error instead of a picture for every packet.
 */
class ErroringPort implements VideoDecoderPort<never> {
  public isSupported(): Promise<boolean> {
    return Promise.resolve(true);
  }

  public create(
    _configuration: VideoDecoderConfiguration,
    callbacks: VideoDecoderCallbacks<never>,
  ): Promise<VideoDecoderHandle> {
    const decoder = new StalledDecoder();
    decoder.decode = (): void => {
      callbacks.onError(new GyroViewError('decode', 'bitstream error'));
    };
    return Promise.resolve(decoder);
  }
}

/**
 * A decoder that refuses the first packet on the spot, as WebCodecs does with a key frame that
 * is none.
 */
class PacketRefusingPort implements VideoDecoderPort<never> {
  public isSupported(): Promise<boolean> {
    return Promise.resolve(true);
  }

  public create(): Promise<VideoDecoderHandle> {
    const decoder = new StalledDecoder();
    decoder.decode = (): void => {
      throw new GyroViewError('decode', 'a key frame is required after configure()');
    };
    return Promise.resolve(decoder);
  }
}

describe('probeDecoding', () => {
  it('reports that every lens decodes, leaving no frame open and every decoder closed', async () => {
    const port = new FakeVideoDecoderPort({ latencyTicks: 2 });
    const report = await probeDecoding(tracks([30, 30]), port, new Deferred<void>());
    expect(report.canDecode).toBe(true);
    expect(report.sources.map((lens) => lens.verdict)).toEqual(['decodes', 'decodes']);
    expect(report.sources[0]?.track.trackIndex).toBe(0);
    expect(port.openFrames).toBe(0);
    expect(port.decodersCreated.every((decoder) => decoder.isClosed)).toBe(true);
  });

  it('probes a track that does not start at zero from its first key frame', async () => {
    const late = new FakeVideoTrack({
      trackIndex: 0,
      frameRate: 30,
      frameCount: 30,
      framesPerGop: 30,
      firstTimestamp: seconds(0.7),
    });
    const report = await probeDecoding([late], new FakeVideoDecoderPort(), new Deferred<void>());
    expect(report.sources[0]?.verdict).toBe('decodes');
  });

  it('reports an unsupported configuration without opening a decoder', async () => {
    const port = new FakeVideoDecoderPort({ unsupportedCodecs: ['fake.1'] });
    const report = await probeDecoding(tracks([30]), port, new Deferred<void>());
    expect(report.canDecode).toBe(false);
    expect(report.sources[0]).toMatchObject({
      verdict: 'unsupported-configuration',
      detail: expect.stringContaining('fake.1') as string,
    });
    expect(port.decodersCreated).toHaveLength(0);
  });

  it('marks a lens whose track has no key frame and still probes the other lens', async () => {
    const port = new FakeVideoDecoderPort();
    const report = await probeDecoding(tracks([30, 0]), port, new Deferred<void>());
    expect(report.canDecode).toBe(false);
    expect(report.sources.map((lens) => lens.verdict)).toEqual(['decodes', 'no-key-frame']);
  });

  it('rejects with the read failure of a track, not a codec verdict, and closes the other decoders at once', async () => {
    const port = new StalledPort();
    const [readable] = tracks([30]);
    const unreadable = new UnreadableTrack({
      trackIndex: 1,
      frameRate: 30,
      frameCount: 30,
      framesPerGop: 30,
    });
    const probing = probeDecoding([readable ?? unreadable, unreadable], port, new Deferred<void>());
    await expect(probing).rejects.toMatchObject({ code: 'source-unreadable' });
    await settle();
    expect(port.decoders).toHaveLength(1);
    expect(port.decoders[0]?.isClosed).toBe(true);
  });

  it('maps a refused decoder creation onto the codec verdicts', async () => {
    const unsupported = new RefusingPort(new GyroViewError('codec-unsupported', 'no hevc here'));
    const broken = new RefusingPort(new Error('out of decoder instances'));
    const deadline = new Deferred<void>();
    const [first, second] = await Promise.all([
      probeDecoding(tracks([30]), unsupported, deadline),
      probeDecoding(tracks([30]), broken, deadline),
    ]);
    expect(first.sources[0]).toMatchObject({
      verdict: 'unsupported-configuration',
      detail: 'no hevc here',
    });
    expect(second.sources[0]).toMatchObject({
      verdict: 'decode-failed',
      detail: 'out of decoder instances',
    });
  });

  it('reports a first packet the decoder refuses on the spot as a failed decode', async () => {
    const report = await probeDecoding(
      tracks([30, 30]),
      new PacketRefusingPort(),
      new Deferred<void>(),
    );
    expect(report.sources.map((lens) => lens.verdict)).toEqual(['decode-failed', 'decode-failed']);
    expect(report.sources[0]?.detail).toBe('a key frame is required after configure()');
  });

  it('reports a decoder error on the first packet as a failed decode', async () => {
    const report = await probeDecoding(tracks([30]), new ErroringPort(), new Deferred<void>());
    expect(report.sources[0]).toMatchObject({
      verdict: 'decode-failed',
      detail: 'bitstream error',
    });
  });

  it('gives up on a stalled decoder when the deadline passes and closes it', async () => {
    const port = new StalledPort();
    const deadline = new Deferred<void>();
    const pending = probeDecoding(tracks([30, 30]), port, deadline);
    await settle();
    expect(port.decoders).toHaveLength(2);
    deadline.resolve();
    const report = await pending;
    expect(report.canDecode).toBe(false);
    expect(report.sources.map((lens) => lens.verdict)).toEqual(['timed-out', 'timed-out']);
    expect(port.decoders.map((decoder) => decoder.isClosed)).toEqual([true, true]);
  });

  it('closes a decoder that appears only after the deadline and reports it timed out', async () => {
    const port = new LatePort();
    const deadline = new Deferred<void>();
    const pending = probeDecoding(tracks([30]), port, deadline);
    await settle();
    deadline.resolve();
    const report = await pending;
    expect(report.sources[0]?.verdict).toBe('timed-out');
    port.gate.resolve();
    await settle();
    expect(port.decoders.map((decoder) => decoder.isClosed)).toEqual([true]);
  });

  it('reads no key frame and opens no decoder once the deadline passed while support was asked', async () => {
    const port = new SlowSupportPort();
    const track = gatedTrack();
    track.keyFrameGate.resolve();
    const deadline = new Deferred<void>();
    const pending = probeDecoding([track], port, deadline);
    deadline.resolve();
    const report = await pending;
    expect(report.sources[0]?.verdict).toBe('timed-out');
    port.gate.resolve();
    await settle();
    expect(track.keyFrameReads).toBe(0);
    expect(port.decoders).toEqual([]);
  });

  it('reports a key frame the deadline passed while it was read as late, and opens no decoder for it', async () => {
    const port = new StalledPort();
    const track = gatedTrack();
    const deadline = new Deferred<void>();
    const pending = probeDecoding([track], port, deadline);
    await settle();
    expect(track.keyFrameReads).toBe(1);
    deadline.resolve();
    const report = await pending;
    expect(report.sources[0]).toMatchObject({
      verdict: 'key-frame-late',
      detail: 'the first key frame did not arrive before the deadline',
    });
    track.keyFrameGate.resolve();
    await settle();
    expect(port.decoders).toEqual([]);
  });

  it('reports a decoder that accepts the key frame but never produces a picture as a failed decode', async () => {
    const report = await probeDecoding(tracks([30]), new SilentPort(), new Deferred<void>());
    expect(report.sources[0]).toMatchObject({
      verdict: 'decode-failed',
      detail: expect.stringContaining('no picture') as string,
    });
  });
});

/**
 * Creates its decoders only once the gate opens.
 */
class LatePort implements VideoDecoderPort<never> {
  public readonly gate = new Deferred<void>();
  public readonly decoders: StalledDecoder[] = [];

  public isSupported(): Promise<boolean> {
    return Promise.resolve(true);
  }

  public async create(): Promise<VideoDecoderHandle> {
    await this.gate.promise;
    const decoder = new StalledDecoder();
    this.decoders.push(decoder);
    return decoder;
  }
}

/**
 * A platform that takes its time to say it supports the configuration.
 */
class SlowSupportPort extends StalledPort {
  public readonly gate = new Deferred<void>();

  public override async isSupported(): Promise<boolean> {
    await this.gate.promise;
    return true;
  }
}

/**
 * A decoder that swallows packets: flush completes with nothing decoded.
 */
class SilentPort implements VideoDecoderPort<never> {
  public isSupported(): Promise<boolean> {
    return Promise.resolve(true);
  }

  public create(): Promise<VideoDecoderHandle> {
    const decoder = new StalledDecoder();
    decoder.flush = (): Promise<void> => Promise.resolve();
    return Promise.resolve(decoder);
  }
}
