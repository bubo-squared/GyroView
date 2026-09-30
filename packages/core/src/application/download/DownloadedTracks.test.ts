import { describe, expect, it } from 'vitest';

import { DownloadedAudioSamples } from './DownloadedAudioSamples';
import { DownloadedVideoTrack } from './DownloadedVideoTrack';
import { FileDownload } from './FileDownload';
import { SourceByteStream } from './SourceByteStream';
import type { DownloadPolicy } from '../../domain/download/DownloadPolicy';
import type { KeyframeRule } from '../../domain/container/KeyframeRule';
import type { VideoTrackCodec } from '../../ports/CodecReader';
import { seconds } from '../../shared/units/time';
import { describeAudioSampleSourceContract } from '../../testing/AudioSampleSource.contract';
import {
  cameraRecording,
  type CameraLayout,
  type CameraRecording,
} from '../../testing/cameraRecording';
import { InMemoryRandomAccessSource } from '../../testing/InMemoryRandomAccessSource';
import { describeVideoTrackReaderContract } from '../../testing/VideoTrackReader.contract';

const LAYOUT: CameraLayout = {
  frames: 30,
  frameBytes: 40,
  soundBytes: 8,
  frameRate: 10,
  framesPerGop: 10,
};
const POLICY: DownloadPolicy = {
  aheadSeconds: seconds(1),
  aheadBytes: 10_000,
  keepBehindBytes: 1000,
  requestSize: 500,
  requestsInFlight: 2,
  bridgedGap: 100,
  refillBytes: 1000,
};
const NOT_A_KEYFRAME = 0xee;
/**
 * Rejects a keyframe whose bytes start with the marker, as a sync sample that is not one.
 */
const MARKED_KEYFRAMES_ARE_NOT: KeyframeRule = {
  isKeyframe: (sample) => sample[0] !== NOT_A_KEYFRAME,
};

const CODEC: VideoTrackCodec = {
  trackId: 1,
  description: { trackIndex: 0, codec: 'avc1.64000a', codedWidth: 64, codedHeight: 64 },
  configuration: {
    codec: 'avc1.64000a',
    codedWidth: 64,
    codedHeight: 64,
    description: undefined,
    isFullRange: false,
  },
};

/**
 * Every byte of every sample is its frame number plus one, so a sample's bytes tell which it is.
 */
function bytesOf(recording: CameraRecording): Uint8Array {
  const bytes = new Uint8Array(recording.fileSize);
  for (const track of recording.table.tracks) {
    for (let sample = 0; sample < track.sampleCount; sample += 1) {
      const range = track.rangeOf(sample);
      bytes.fill(sample + 1, range.offset, range.end);
    }
  }
  return bytes;
}

function downloadOf(recording: CameraRecording, bytes = bytesOf(recording)): FileDownload {
  const stream = new SourceByteStream(new InMemoryRandomAccessSource(bytes));
  return new FileDownload({ table: recording.table, stream, policy: POLICY });
}

function lensOf(recording: CameraRecording, bytes?: Uint8Array): DownloadedVideoTrack {
  const download = downloadOf(recording, bytes);
  return new DownloadedVideoTrack({ download, track: recording.lens0, codec: CODEC });
}

describeVideoTrackReaderContract(
  'downloaded',
  () => Promise.resolve(lensOf(cameraRecording(LAYOUT))),
  {
    frameCount: 30,
    frameRate: 10,
    framesPerGop: 10,
  },
);

/**
 * The sound of a recording whose picture is read through to its end alongside, as playing reads
 * it: sound is read only within the picture's window.
 */
function soundWithItsPicture(recording: CameraRecording): DownloadedAudioSamples {
  const download = downloadOf(recording);
  const lens = new DownloadedVideoTrack({ download, track: recording.lens0, codec: CODEC });
  void Array.fromAsync(lens.packetsFrom(seconds(0)));
  return new DownloadedAudioSamples({ download, track: recording.sound });
}

describeAudioSampleSourceContract(
  'downloaded',
  () => Promise.resolve(soundWithItsPicture(cameraRecording(LAYOUT))),
  { sampleCount: 30, sampleDuration: 0.1, firstTimestamp: 0 },
);

describe('DownloadedVideoTrack', () => {
  it('describes its track and configures its decoder as the codec reader told', async () => {
    const lens = lensOf(cameraRecording(LAYOUT));
    expect(lens.description).toBe(CODEC.description);
    await expect(lens.decoderConfiguration()).resolves.toBe(CODEC.configuration);
  });

  it('hands out each packet with its own bytes', async () => {
    const packets = await Array.fromAsync(lensOf(cameraRecording(LAYOUT)).packetsFrom(seconds(1)));
    expect(packets.map((packet) => packet.data[0])).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 11),
    );
  });

  it('starts an earlier keyframe when the one listed turns out not to be one, and tells so after', async () => {
    const recording = cameraRecording({ ...LAYOUT, keyframeRule: MARKED_KEYFRAMES_ARE_NOT });
    const bytes = bytesOf(recording);
    const listed = recording.lens0.rangeOf(10);
    bytes.fill(NOT_A_KEYFRAME, listed.offset, listed.end);
    const lens = lensOf(recording, bytes);
    await expect(lens.keyframeAt(seconds(1.5))).resolves.toMatchObject({ timestamp: 1 });
    const [first] = await Array.fromAsync(lens.packetsFrom(seconds(1.5)));
    expect(first?.timestamp).toBe(0);
    await expect(lens.keyframeAt(seconds(1.5))).resolves.toMatchObject({ timestamp: 0 });
  });

  it('fails its first packet with no-key-frame when the track has none to start from', async () => {
    const recording = cameraRecording({ ...LAYOUT, keyframeRule: { isKeyframe: () => false } });
    const packets = lensOf(recording).packetsFrom(seconds(1))[Symbol.asyncIterator]();
    await expect(packets.next()).rejects.toMatchObject({ code: 'no-key-frame' });
  });
});

describe('DownloadedAudioSamples', () => {
  it('copies each sample out of what was downloaded, so none keeps a block alive', async () => {
    const sound = soundWithItsPicture(cameraRecording(LAYOUT));
    const [first] = await Array.fromAsync(sound.samplesFrom(seconds(0)));
    expect(first?.data.buffer.byteLength).toBe(LAYOUT.soundBytes);
  });
});
