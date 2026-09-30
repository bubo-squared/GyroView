import { DownloadedAudioSamples } from './DownloadedAudioSamples';
import { DownloadedVideoTrack } from './DownloadedVideoTrack';
import { FileDownload } from './FileDownload';
import type { SampleTable } from '../../domain/container/SampleTable';
import type { TrackKind, TrackSampleTable } from '../../domain/container/TrackSampleTable';
import type { DownloadPolicy } from '../../domain/download/DownloadPolicy';
import type { AudioDecoderConfiguration } from '../../ports/AudioTrack';
import type { ByteStream } from '../../ports/ByteStream';
import type { ContainerCodecs } from '../../ports/CodecReader';
import { GyroViewError } from '../../shared/errors/GyroViewError';
import type { Seconds } from '../../shared/units/time';

export interface FileDownloadStart {
  readonly table: SampleTable;
  readonly stream: ByteStream;
  readonly codecs: ContainerCodecs;
  readonly policy: DownloadPolicy;
}

/**
 * A sound track of a downloaded file: its samples, and how they are decoded.
 */
export interface DownloadedAudioTrack {
  readonly samples: DownloadedAudioSamples;
  readonly configuration: AudioDecoderConfiguration;
}

/**
 * A file of a recording, downloaded while it plays: its tracks of picture and sound, read
 * through the one download.
 */
export interface DownloadedFile {
  readonly download: FileDownload;
  /**
   * In the order the codec reader told of them.
   */
  readonly videoTracks: readonly DownloadedVideoTrack[];
  readonly audioTracks: readonly DownloadedAudioTrack[];
  readonly duration: Seconds;
  dispose(): void;
}

/**
 * Use case: download a file while it plays, its tracks joined to their codecs by track id.
 */
export function startFileDownload(start: FileDownloadStart): DownloadedFile {
  const download = new FileDownload(start);
  const videoTracks = start.codecs.video.map(
    (codec) =>
      new DownloadedVideoTrack({
        download,
        track: trackOf(start.table, codec.trackId, 'video'),
        codec,
      }),
  );
  const audioTracks = start.codecs.audio.map((codec) => ({
    samples: new DownloadedAudioSamples({
      download,
      track: trackOf(start.table, codec.trackId, 'audio'),
    }),
    configuration: codec.configuration,
  }));
  return {
    download,
    videoTracks,
    audioTracks,
    duration: start.table.duration,
    dispose: (): void => {
      download.dispose();
    },
  };
}

function trackOf(table: SampleTable, trackId: number, kind: TrackKind): TrackSampleTable {
  const track = table.trackWithId(trackId);
  if (track?.kind !== kind) {
    throw new GyroViewError(
      'unsupported-container',
      `the movie box has no ${kind} track ${trackId} to read`,
    );
  }
  return track;
}
