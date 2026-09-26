import { describe, expect, it } from 'vitest';

import { FakeVideoTrack } from './FakeVideoTrack';
import { seconds } from '../shared/units/time';
import { describeVideoTrackReaderContract } from './VideoTrackReader.contract';

describeVideoTrackReaderContract(
  'FakeVideoTrack',
  () =>
    Promise.resolve(
      new FakeVideoTrack({ trackIndex: 0, frameRate: 10, frameCount: 30, framesPerGop: 10 }),
    ),
  { frameCount: 30, frameRate: 10, framesPerGop: 10 },
);

describeVideoTrackReaderContract(
  'FakeVideoTrack starting at 0.7 s',
  () =>
    Promise.resolve(
      new FakeVideoTrack({
        trackIndex: 0,
        frameRate: 10,
        frameCount: 30,
        framesPerGop: 10,
        firstTimestamp: seconds(0.7),
      }),
    ),
  { frameCount: 30, frameRate: 10, framesPerGop: 10, firstTimestamp: 0.7 },
);

describe('FakeVideoTrack shape options', () => {
  it('describes a packed dual-fisheye track with its own width, height and codec', async () => {
    const track = new FakeVideoTrack({
      trackIndex: 0,
      frameRate: 30,
      frameCount: 3,
      framesPerGop: 3,
      codedWidth: 1664,
      codedHeight: 832,
      codec: 'avc1.fake',
    });
    expect(track.description).toEqual({
      trackIndex: 0,
      codedWidth: 1664,
      codedHeight: 832,
      codec: 'avc1.fake',
    });
    await expect(track.decoderConfiguration()).resolves.toMatchObject({
      codedWidth: 1664,
      codedHeight: 832,
      codec: 'avc1.fake',
    });
  });
});
