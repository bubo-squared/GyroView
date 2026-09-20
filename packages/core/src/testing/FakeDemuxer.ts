import type { AudioTrackReader, DemuxedInput, Demuxer, VideoTrackReader } from '../ports/Demuxer';
import type { RandomAccessSource } from '../ports/RandomAccessSource';
import { GyroViewError } from '../shared/errors/GyroViewError';
import type { Seconds } from '../shared/units/time';

/**
 * What the fake answers when a registered source (by identity) or name is opened.
 */
export interface FakeInputSpec {
  readonly source?: RandomAccessSource;
  readonly name?: string;
  readonly duration: Seconds;
  readonly videoTracks: readonly VideoTrackReader[];
  readonly audioTracks?: readonly AudioTrackReader[];
}

/**
 * Test double for the demuxer port: hands out the tracks a test registered for a source, and
 * counts the inputs it opened and disposed so composition tests can prove nothing leaks. A
 * source nobody registered is "not a media file", as with the real adapter.
 */
export class FakeDemuxer implements Demuxer {
  public readonly opened: DemuxedInput[] = [];
  private disposedCount = 0;

  public constructor(private readonly specs: readonly FakeInputSpec[]) {}

  public get openCount(): number {
    return this.opened.length - this.disposedCount;
  }

  public open(source: RandomAccessSource, name?: string): Promise<DemuxedInput> {
    const spec = this.specs.find((candidate) => isSpecFor(candidate, source, name));
    if (!spec) {
      return Promise.reject(
        new GyroViewError(
          'unsupported-layout',
          `${name ?? 'the input'} is not a readable media file`,
        ),
      );
    }
    const input: DemuxedInput = {
      name: name ?? spec.name,
      duration: spec.duration,
      videoTracks: spec.videoTracks,
      audioTracks: spec.audioTracks ?? [],
      dispose: (): void => {
        this.disposedCount += 1;
      },
    };
    this.opened.push(input);
    return Promise.resolve(input);
  }
}

function isSpecFor(
  spec: FakeInputSpec,
  source: RandomAccessSource,
  name: string | undefined,
): boolean {
  return spec.source === undefined
    ? spec.name !== undefined && spec.name === name
    : spec.source === source;
}
