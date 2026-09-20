import { seconds, type Seconds } from '@gyroview/core';
import { FakeVideoTrack } from '@gyroview/core/testing';
import { beforeAll, describe, expect, it } from 'vitest';

import { frameTimesFor } from './frameTimesFor';
import {
  officeRecords,
  recordingOf,
  syntheticRecordingBytes,
  type OfficeRecords,
} from '../test/recordings';

/**
 * Counts how often the costly sample-table walk was paid for.
 */
class CountingTrack extends FakeVideoTrack {
  public sampleTimestampCalls = 0;

  public override sampleTimestamps(): Promise<readonly Seconds[]> {
    this.sampleTimestampCalls += 1;
    return super.sampleTimestamps();
  }
}

function trackOf(frameCount: number): CountingTrack {
  return new CountingTrack({ trackIndex: 0, frameRate: 10, frameCount, framesPerGop: 10 });
}

const fixture: { records: OfficeRecords } = { records: undefined as unknown as OfficeRecords };

beforeAll(async () => {
  fixture.records = await officeRecords();
});

describe('frameTimesFor', () => {
  it('takes the exposure record when it covers the track, without touching the sample table', async () => {
    const recording = await recordingOf(syntheticRecordingBytes(fixture.records));
    const track = trackOf(10);

    const resolved = await frameTimesFor(recording, track, await recording.captureClock());

    expect(resolved?.source).toBe('exposure-record');
    expect(resolved?.frameTimes.frameCount).toBe(10);
    expect(resolved?.frameTimes.hasShutterTimes).toBe(true);
    expect(track.sampleTimestampCalls).toBe(0);
  });

  it('pays for the track timestamps only when the cheap sources leave nominal spacing', async () => {
    const recording = await recordingOf(syntheticRecordingBytes(fixture.records));
    const track = trackOf(30);

    const resolved = await frameTimesFor(recording, track, await recording.captureClock());

    expect(resolved?.source).toBe('track-timestamps');
    expect(resolved?.frameTimes.frameCount).toBe(30);
    expect(resolved?.warnings).toEqual(['exposure-record unavailable']);
    expect(track.sampleTimestampCalls).toBe(1);
  });

  it('keeps the frame at video time zero on the first frame whatever the track origin', async () => {
    const recording = await recordingOf(syntheticRecordingBytes(fixture.records));
    const track = new CountingTrack({
      trackIndex: 0,
      frameRate: 10,
      frameCount: 30,
      framesPerGop: 10,
      firstTimestamp: seconds(0.7),
    });

    const resolved = await frameTimesFor(recording, track, await recording.captureClock());

    expect(resolved?.frameTimes.frameAt(0).videoTime).toBeCloseTo(0, 6);
    expect(resolved?.frameTimes.frameAt(10).videoTime).toBeCloseTo(1, 6);
  });
});
