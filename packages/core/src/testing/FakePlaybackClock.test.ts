import { FakePlaybackClock } from './FakePlaybackClock';
import { describePlaybackClockContract } from './PlaybackClock.contract';
import { seconds } from '../shared/units/time';

const ENDS_AT = seconds(3);

describePlaybackClockContract(
  () => {
    const clock = new FakePlaybackClock({ endsAt: ENDS_AT });
    return Promise.resolve({
      clock,
      letTimePass: (elapsed) => {
        clock.advance(elapsed);
        return Promise.resolve();
      },
    });
  },
  { endsAt: ENDS_AT },
);
