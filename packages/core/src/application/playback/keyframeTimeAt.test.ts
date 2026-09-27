import { describe, expect, it } from 'vitest';

import { keyframeTimeAt } from './keyframeTimeAt';
import { seconds } from '../../shared/units/time';
import { FakeVideoTrack } from '../../testing/FakeVideoTrack';

const OPTIONS = { trackIndex: 0, frameRate: 10, frameCount: 30, framesPerGop: 10 };

class UnreadableTrack extends FakeVideoTrack {
  public override keyPacketAt(): Promise<undefined> {
    return Promise.reject(new Error('input disposed'));
  }
}

describe('keyframeTimeAt', () => {
  it('finds the key frame at or before the time', async () => {
    await expect(keyframeTimeAt(new FakeVideoTrack(OPTIONS), seconds(1.55))).resolves.toBe(1);
  });

  it('falls back to the time itself when the track cannot say', async () => {
    await expect(keyframeTimeAt(new UnreadableTrack(OPTIONS), seconds(1.55))).resolves.toBe(1.55);
  });
});
