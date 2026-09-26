import { describe, expect, it } from 'vitest';

import { probeDecoding } from './probeDecoding';
import type { VideoDecoderConfiguration } from '../../ports/VideoTrack';
import type {
  VideoDecoderCallbacks,
  VideoDecoderHandle,
  VideoDecoderPort,
} from '../../ports/VideoDecoderPort';
import { Deferred } from '../../shared/async/Deferred';
import { Signal } from '../../shared/async/Signal';
import { GyroViewError } from '../../shared/errors/GyroViewError';
import { FakeVideoDecoderPort } from '../../testing/FakeVideoDecoderPort';
import { FakeVideoTrack } from '../../testing/FakeVideoTrack';

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
  public resets = 0;

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

  public reset(): void {
    this.resets += 1;
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

describe('probeDecoding', () => {
  it('reports that every lens decodes, leaving no frame open and every decoder closed', async () => {
    const port = new FakeVideoDecoderPort({ latencyTicks: 2 });
    const report = await probeDecoding(tracks([30, 30]), port, { deadline: new Signal() });
    expect(report.canDecode).toBe(true);
    expect(report.sources.map((lens) => lens.verdict)).toEqual(['decodes', 'decodes']);
    expect(report.sources[0]?.track.trackIndex).toBe(0);
    expect(port.openFrames).toBe(0);
    expect(port.decodersCreated.every((decoder) => decoder.isClosed)).toBe(true);
  });

  it('reports an unsupported configuration without opening a decoder', async () => {
    const port = new FakeVideoDecoderPort({ unsupportedCodecs: ['fake.1'] });
    const report = await probeDecoding(tracks([30]), port, { deadline: new Signal() });
    expect(report.canDecode).toBe(false);
    expect(report.sources[0]).toMatchObject({
      verdict: 'unsupported-configuration',
      detail: expect.stringContaining('fake.1') as string,
    });
    expect(port.decodersCreated).toHaveLength(0);
  });

  it('marks a lens whose track has no key frame and still probes the other lens', async () => {
    const port = new FakeVideoDecoderPort();
    const report = await probeDecoding(tracks([30, 0]), port, { deadline: new Signal() });
    expect(report.canDecode).toBe(false);
    expect(report.sources.map((lens) => lens.verdict)).toEqual(['decodes', 'no-key-frame']);
  });

  it('maps a refused decoder creation onto the codec verdicts', async () => {
    const unsupported = new RefusingPort(new GyroViewError('codec-unsupported', 'no hevc here'));
    const broken = new RefusingPort(new Error('out of decoder instances'));
    const deadline = new Signal();
    const [first, second] = await Promise.all([
      probeDecoding(tracks([30]), unsupported, { deadline }),
      probeDecoding(tracks([30]), broken, { deadline }),
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

  it('reports a decoder error on the first packet as a failed decode', async () => {
    const report = await probeDecoding(tracks([30]), new ErroringPort(), {
      deadline: new Signal(),
    });
    expect(report.sources[0]).toMatchObject({
      verdict: 'decode-failed',
      detail: 'bitstream error',
    });
  });

  it('gives up on a stalled decoder when the deadline passes and closes it', async () => {
    const port = new StalledPort();
    const deadline = new Signal();
    const pending = probeDecoding(tracks([30, 30]), port, { deadline });
    await Promise.resolve();
    deadline.trigger();
    const report = await pending;
    expect(report.canDecode).toBe(false);
    expect(report.sources.map((lens) => lens.verdict)).toEqual(['timed-out', 'timed-out']);
    expect(port.decoders.map((decoder) => decoder.isClosed)).toEqual([true, true]);
  });

  it('closes a decoder that appears only after the deadline and reports it timed out', async () => {
    const port = new LatePort();
    const deadline = new Signal();
    const pending = probeDecoding(tracks([30]), port, { deadline });
    await Promise.resolve();
    deadline.trigger();
    const report = await pending;
    expect(report.sources[0]?.verdict).toBe('timed-out');
    port.gate.resolve();
    await new Promise((resolve) => setTimeout(resolve, 1));
    expect(port.decoders.map((decoder) => decoder.isClosed)).toEqual([true]);
  });

  it('reports a decoder that accepts the key frame but never produces a picture as a failed decode', async () => {
    const report = await probeDecoding(tracks([30]), new SilentPort(), { deadline: new Signal() });
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
