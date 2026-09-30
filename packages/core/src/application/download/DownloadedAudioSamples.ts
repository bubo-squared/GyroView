import type { FileDownload } from './FileDownload';
import type { SampleCursor } from './SampleCursor';
import type { TrackSampleTable } from '../../domain/container/TrackSampleTable';
import type { AudioSampleSource } from '../../ports/AudioSampleSource';
import type { EncodedAudioSample } from '../../ports/AudioTrack';
import { Ending, ITERATION_END } from '../../shared/async/iteration';
import type { Seconds } from '../../shared/units/time';

export interface DownloadedAudioSamplesParts {
  readonly download: FileDownload;
  readonly track: TrackSampleTable;
}

/**
 * A sound track's samples read through the file's download, within the picture's reach.
 */
export class DownloadedAudioSamples implements AudioSampleSource {
  public constructor(private readonly parts: DownloadedAudioSamplesParts) {}

  public get duration(): Seconds {
    return this.parts.track.end;
  }

  public samplesFrom(time: Seconds): AsyncIterable<EncodedAudioSample> {
    const { download, track } = this.parts;
    return {
      [Symbol.asyncIterator]: (): AsyncIterator<EncodedAudioSample> =>
        new SampleReading(track, download.openCursor(track, track.sampleShownAt(time) ?? 0, time)),
    };
  }
}

/**
 * One iteration over the samples; each is copied out of what was downloaded, so the samples a
 * media pipeline keeps do not keep the download's blocks alive.
 */
class SampleReading implements AsyncIterator<EncodedAudioSample> {
  private readonly ending = new Ending();

  public constructor(
    private readonly track: TrackSampleTable,
    private readonly cursor: SampleCursor,
  ) {}

  public async next(): Promise<IteratorResult<EncodedAudioSample>> {
    const read = await this.cursor.nextSample();
    if (!read || this.ending.hasEnded()) return ITERATION_END;
    const sample = {
      timestamp: this.track.timestampOf(read.sample),
      duration: this.track.durationOf(read.sample),
      data: Uint8Array.from(read.bytes),
    };
    return { done: false, value: sample };
  }

  public return(): Promise<IteratorResult<EncodedAudioSample>> {
    this.ending.end();
    this.cursor.close();
    return Promise.resolve(ITERATION_END);
  }
}
