import { describeVideoTrackReaderContract } from './VideoTrackReader.contract';
import { FakeVideoTrack } from './FakeVideoTrack';

describeVideoTrackReaderContract(
  'FakeVideoTrack',
  () =>
    Promise.resolve(
      new FakeVideoTrack({ trackIndex: 0, frameRate: 10, frameCount: 30, framesPerGop: 10 }),
    ),
  { frameCount: 30, frameRate: 10, framesPerGop: 10 },
);
