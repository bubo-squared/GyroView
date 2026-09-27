import { describeVideoDecoderPortContract } from './VideoDecoderPort.contract';
import { FakeVideoDecoderPort } from './FakeVideoDecoderPort';
import { FakeVideoTrack } from './FakeVideoTrack';
import { settle } from '../../test/support/settle';

describeVideoDecoderPortContract('FakeVideoDecoderPort', () =>
  Promise.resolve({
    port: new FakeVideoDecoderPort({ latencyTicks: 2 }),
    track: new FakeVideoTrack({ trackIndex: 0, frameRate: 10, frameCount: 30, framesPerGop: 10 }),
    letTimePass: settle,
  }),
);
