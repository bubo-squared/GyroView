import { describe, expect, it } from 'vitest';

import { timeRecording } from './timeRecording';
import { PtsType } from '../../domain/format/info/infoFields';
import { GYRO_LAYOUT_PROBE_SIZE } from '../../domain/format/records/gyro/parseGyroRecord';
import { FakeVideoTrack } from '../../testing/FakeVideoTrack';
import { minimalInfoRecord } from '../../testing/minimalInfoRecord';
import { seconds, type Seconds } from '../../shared/units/time';
import { officeRecording } from '../../../test/support/officeRecording';

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

/**
 * The office recording's first-frame stamp, as its info record writes it.
 */
const OFFICE_FIRST_FRAME_STAMP = 921_751_839;

/**
 * A track whose sample table gives no timestamps to time its frames by.
 */
class UntimedTrack extends FakeVideoTrack {
  public override sampleTimestamps(): Promise<readonly Seconds[]> {
    return Promise.resolve([]);
  }
}

function trackOf(frameCount: number): CountingTrack {
  return new CountingTrack({ trackIndex: 0, frameRate: 10, frameCount, framesPerGop: 10 });
}

describe('timeRecording', () => {
  it('takes the exposure record when it covers the frame source, without walking the sample table', async () => {
    const track = trackOf(10);
    const timing = await timeRecording(await officeRecording(), track);
    expect(timing.frameTimeSource).toBe('exposure-record');
    expect(timing.frameTimes?.frameCount).toBe(10);
    expect(timing.frameTimes?.frameAt(0).shutterTime).toBeDefined();
    expect(track.sampleTimestampCalls).toBe(0);
  });

  it('pays for the track timestamps only when the cheap sources leave nominal spacing', async () => {
    const track = trackOf(30);
    const timing = await timeRecording(await officeRecording(), track);
    expect(timing.frameTimeSource).toBe('track-timestamps');
    expect(timing.frameTimes?.frameCount).toBe(30);
    expect(timing.warnings).toEqual(['exposure-record unavailable']);
    expect(track.sampleTimestampCalls).toBe(1);
  });

  it.each([
    [PtsType.TrackTimestamps, 'track-timestamps', 1],
    [PtsType.ExposureRecord, 'exposure-record', 0],
  ] as const)(
    'follows the camera on which source to trust first (pts_type %i)',
    async (ptsType, expectedSource, expectedWalks) => {
      const track = trackOf(10);
      const info = minimalInfoRecord({
        model: 'Insta360 X5',
        firstFrameTimestamp: OFFICE_FIRST_FRAME_STAMP,
        ptsType,
      });
      const timing = await timeRecording(await officeRecording({ info }), track);
      expect(timing.frameTimeSource).toBe(expectedSource);
      expect(track.sampleTimestampCalls).toBe(expectedWalks);
    },
  );

  it.each([
    [30, 'track-timestamps'],
    [10, 'exposure-record'],
  ] as const)(
    'times the frames of a track that starts late where the decoder shows them (%i frames, %s)',
    async (frameCount, expectedSource) => {
      const track = new CountingTrack({
        trackIndex: 0,
        frameRate: 10,
        frameCount,
        framesPerGop: 10,
        firstTimestamp: seconds(0.7),
      });
      const timing = await timeRecording(await officeRecording(), track);
      expect(timing.frameTimeSource).toBe(expectedSource);
      expect(timing.frameTimes?.frameAt(0).videoTime).toBeCloseTo(0.7, 6);
      expect(timing.frameTimes?.frameIndexAt(seconds(0.7))).toBe(0);
      expect(timing.frameTimes?.frameIndexAt(seconds(1.5))).toBe(8);
    },
  );

  it('integrates the gyro under the verified X5 frame', async () => {
    const timing = await timeRecording(await officeRecording(), trackOf(10));
    expect(timing.motion?.imuFrame.name).toBe('X5');
    expect(timing.motion?.orientations.length).toBe(2000);
    expect(timing.warnings).toEqual([]);
  });

  it('still stabilizes an unknown camera but warns that its IMU frame is a guess', async () => {
    const info = minimalInfoRecord({ model: 'Insta360 X3', firstFrameTimestamp: 1_000_000 });
    const timing = await timeRecording(await officeRecording({ info }), trackOf(10));
    expect(timing.motion?.imuFrame.isVerified).toBe(false);
    expect(timing.warnings).toContain(
      'the IMU frame of Insta360 X3 has not been verified on a recording; stabilization may misbehave',
    );
  });

  it('plays without stabilization when the camera wrote no gyro record', async () => {
    const timing = await timeRecording(await officeRecording({ hasGyro: false }), trackOf(10));
    expect(timing.motion).toBeUndefined();
    expect(timing.frameTimeSource).toBe('exposure-record');
    expect(timing.warnings).toEqual([
      'the recording has no gyro record; stabilization is unavailable',
    ]);
  });

  it('times the frames by their track timestamps when no source can, and still stabilizes', async () => {
    const info = minimalInfoRecord({
      model: 'Insta360 X5',
      firstFrameTimestamp: OFFICE_FIRST_FRAME_STAMP,
    });
    const track = new UntimedTrack({
      trackIndex: 0,
      frameRate: 10,
      frameCount: 10,
      framesPerGop: 10,
    });
    const timing = await timeRecording(await officeRecording({ info, hasExposure: false }), track);
    expect(timing.frameTimes).toBeUndefined();
    expect(timing.motion).toBeDefined();
    expect(timing.warnings).toEqual([
      'no frame timing source is usable; frames are timed by their track timestamps',
    ]);
  });

  it('plays untimed when the gyro layout cannot be told from the record', async () => {
    const info = minimalInfoRecord({
      model: 'Insta360 X5',
      firstFrameTimestamp: OFFICE_FIRST_FRAME_STAMP,
    });
    const unreadable = new Uint8Array(GYRO_LAYOUT_PROBE_SIZE).fill(0xff);
    const recording = await officeRecording({ info, gyro: unreadable });
    const timing = await timeRecording(recording, trackOf(10));
    expect(timing.motion).toBeUndefined();
    expect(timing.frameTimes).toBeUndefined();
    expect(timing.warnings).toEqual([
      expect.stringMatching(
        /gyro sample layout.*; frame timing and stabilization are unavailable$/u,
      ),
    ]);
  });

  it('says there is no capture clock when the info record does not date the first frame', async () => {
    const info = minimalInfoRecord({ model: 'Insta360 X3' });
    const timing = await timeRecording(await officeRecording({ info }), trackOf(10));
    expect(timing.motion).toBeUndefined();
    expect(timing.frameTimes).toBeUndefined();
    expect(timing.warnings).toEqual([
      'the recording has no capture clock; frame timing and stabilization are unavailable',
    ]);
  });

  it('says so when there is no frame source to time', async () => {
    const timing = await timeRecording(await officeRecording(), undefined);
    expect(timing.frameTimes).toBeUndefined();
    expect(timing.warnings).toEqual([
      'the recording has no frame source to time; frame timing and stabilization are unavailable',
    ]);
  });
});
