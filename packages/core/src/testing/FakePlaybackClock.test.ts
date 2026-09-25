import { FakePlaybackClock } from './FakePlaybackClock';
import { describePlaybackClockContract } from './PlaybackClock.contract';

describePlaybackClockContract(() => {
  const clock = new FakePlaybackClock();
  return Promise.resolve({
    clock,
    letTimePass: (elapsed) => {
      clock.advance(elapsed);
      return Promise.resolve();
    },
  });
});
