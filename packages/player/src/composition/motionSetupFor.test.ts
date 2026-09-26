import { beforeAll, describe, expect, it } from 'vitest';

import { motionSetupFor } from './motionSetupFor';
import {
  clockOf,
  minimalInfoRecord,
  officeRecords,
  recordingOf,
  syntheticRecordingBytes,
  type OfficeRecords,
} from '../test/recordings';

const fixture: { records: OfficeRecords } = { records: undefined as unknown as OfficeRecords };

beforeAll(async () => {
  fixture.records = await officeRecords();
});

describe('motionSetupFor', () => {
  it('integrates the gyro under the verified X5 frame without warnings', async () => {
    const recording = await recordingOf(syntheticRecordingBytes(fixture.records));

    const motion = await motionSetupFor(recording, await clockOf(recording));

    expect(motion.setup?.imuFrame.name).toBe('X5');
    expect(motion.setup?.orientations.length).toBe(2000);
    expect(motion.warnings).toEqual([]);
  });

  it('still stabilizes an unknown camera but warns that its IMU frame is a guess', async () => {
    const info = minimalInfoRecord({ model: 'Insta360 X3', firstFrameTimestamp: 1_000_000 });
    const recording = await recordingOf(
      syntheticRecordingBytes({ info, gyro: fixture.records.gyro }),
    );

    const motion = await motionSetupFor(recording, await clockOf(recording));

    expect(motion.setup?.imuFrame.isVerified).toBe(false);
    expect(motion.warnings).toEqual([
      'the IMU frame of Insta360 X3 has not been verified on a recording; stabilization may misbehave',
    ]);
  });

  it('reports a recording without a gyro record as unstabilizable', async () => {
    const recording = await recordingOf(syntheticRecordingBytes({ info: fixture.records.info }));

    const motion = await motionSetupFor(recording, await clockOf(recording));

    expect(motion.setup).toBeUndefined();
    expect(motion.warnings).toEqual([
      'the recording has no gyro record; stabilization is unavailable',
    ]);
  });
});
