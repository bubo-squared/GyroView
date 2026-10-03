import { existsSync } from 'node:fs';

import { MediabunnyCodecReader } from '@gyroview/adapter-mediabunny';
import { FileRandomAccessSource } from '@gyroview/adapter-node';
import {
  conjugateQuaternion,
  imuFrameFor,
  microseconds,
  OrientationTrack,
  readRecording,
  rotateVector,
  seconds,
  timeRecording,
  toBodyFrame,
  type CaptureClock,
  type GyroTrack,
  type Vector3,
} from '@gyroview/core';
import { openDownloadedSource } from '@gyroview/core/testing';
import { describe, expect, it } from 'vitest';

import { localSampleEntries, recordingPathOf } from './localCatalogueFile';
import { hasSamples, KRNJACA_RECORDING, OFFICE_RECORDING, SAILING_RECORDING } from './samples';

const TIMEOUT_MS = 30_000;
/**
 * Video times, in seconds, at which the estimate is compared with the accelerometer.
 */
const CHECKED_TIMES = [60, 100];
/**
 * The estimated down direction may differ from the accelerometer by this much (degrees): the
 * filter follows gravity with a time constant of seconds while the boat accelerates.
 */
const MAX_DOWN_ERROR_DEGREES = 12;
/**
 * Every this many gyro samples are searched for the one nearest a video time: a tenth of a
 * second at the X5's 1 kHz, far below what the filter's time constant can tell apart.
 */
const SEARCH_STRIDE = 100;
const DOWN: Vector3 = [0, -1, 0];
const OFFICE_FRAME_RATE = 60_000 / 1001;

function angleBetweenDegrees(a: Vector3, b: Vector3): number {
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const lengths = Math.hypot(...a) * Math.hypot(...b);
  return (Math.acos(Math.max(-1, Math.min(1, dot / lengths))) * 180) / Math.PI;
}

function nearestGyroSample(track: GyroTrack, clock: CaptureClock, videoTime: number): number {
  let best = 0;
  let bestDistance = Infinity;
  for (let index = 0; index < track.length; index += SEARCH_STRIDE) {
    const captureTime = microseconds(track.captureTimes[index] ?? 0);
    const distance = Math.abs(clock.gyroVideoTimeOf(captureTime) - videoTime);
    if (distance >= bestDistance) continue;
    bestDistance = distance;
    best = index;
  }
  return best;
}

/**
 * The orientation the player integrates from the real gyro records: the filter leans toward the
 * accelerometer over seconds, so its estimated down stays with measured gravity whatever the IMU
 * frame (ADR 0009); the check guards the filter, not the frame.
 */
describe.skipIf(!hasSamples())('the motion of the real X5 recordings', () => {
  it.each([
    ['office', OFFICE_RECORDING],
    ['sailing', SAILING_RECORDING],
  ])(
    'keeps the estimated down of the %s recording with measured gravity',
    async (_name, file) => {
      const source = await FileRandomAccessSource.open(file);
      try {
        const recording = await readRecording(source);
        const [gyro, clock] = await Promise.all([
          recording.readGyroRecord(),
          recording.captureClock(),
        ]);
        if (!gyro || !clock) throw new Error('the recording lacks a gyro record or a clock');
        const frame = imuFrameFor(recording.info);
        const orientations = OrientationTrack.integrate({ gyro: gyro.track, clock, frame });
        for (const time of CHECKED_TIMES) {
          const sample = gyro.track.sampleAt(nearestGyroSample(gyro.track, clock, time));
          const measuredUp = toBodyFrame(frame, sample.acceleration);
          const orientation = orientations.orientationAt(clock.gyroVideoTimeOf(sample.captureTime));
          const estimatedUp = rotateVector(conjugateQuaternion(orientation), DOWN);
          expect(angleBetweenDegrees(measuredUp, estimatedUp)).toBeLessThan(MAX_DOWN_ERROR_DEGREES);
        }
      } finally {
        await source.close();
      }
    },
    TIMEOUT_MS,
  );
});

async function mountingNameOf(file: string): Promise<string | undefined> {
  const source = await FileRandomAccessSource.open(file);
  const input = await openDownloadedSource(source, new MediabunnyCodecReader());
  try {
    const timing = await timeRecording(await readRecording(source), input.videoTracks[0]);
    return timing.motion?.mounting.name;
  } finally {
    input.dispose();
    await source.close();
  }
}

/**
 * How each recording's camera stood, which `off` and `follow` draw it by (ADR 0038): the
 * evidence the mounting was decided on. Named in the body frame of ADR 0008, whose down an X
 * camera standing upright on a stick holds along its x.
 */
const COMMITTED_MOUNTINGS = (
  [
    ['office', OFFICE_RECORDING, 'upright'],
    ['krnjaca', KRNJACA_RECORDING, 'upright'],
    ['sailing', SAILING_RECORDING, 'on its right side'],
  ] as const
).filter(([, file]) => existsSync(file));

describe.skipIf(COMMITTED_MOUNTINGS.length === 0)('the mounting of the real recordings', () => {
  it.each(COMMITTED_MOUNTINGS)(
    'stands the %s recording as its camera stood',
    async (_name, file, mounting) => {
      expect(await mountingNameOf(file)).toBe(mounting);
    },
    TIMEOUT_MS,
  );
});

const LOCAL_MOUNTINGS = localSampleEntries().filter((entry) => entry.mounting !== undefined);

describe.skipIf(LOCAL_MOUNTINGS.length === 0)('the mounting of the local recordings', () => {
  it.each(LOCAL_MOUNTINGS.map((entry) => [entry.slug, entry] as const))(
    'stands the local recording %s as its camera stood',
    async (_slug, entry) => {
      expect(await mountingNameOf(recordingPathOf(entry))).toBe(entry.mounting);
    },
    TIMEOUT_MS,
  );
});

describe.skipIf(!hasSamples())('the frame times of the real X5 recordings', () => {
  it(
    'place every presented frame of the office recording, though its capture clock drifts a frame from the track',
    async () => {
      const source = await FileRandomAccessSource.open(OFFICE_RECORDING);
      const input = await openDownloadedSource(source, new MediabunnyCodecReader());
      try {
        const [track] = input.videoTracks;
        if (!track) throw new Error('the office recording has no video track');
        const timing = await timeRecording(await readRecording(source), track);
        const timestamps = await track.sampleTimestamps();
        const last = timestamps.length - 1;
        const presentedLast = seconds(timestamps[last] ?? NaN);
        const frameTimes = timing.frameTimes;
        expect(timing.frameTimeSource).toBe('exposure-record');
        // The last frame was captured more than a frame before the track presents it.
        const drift = presentedLast - (frameTimes?.frameAt(last).videoTime ?? NaN);
        expect(drift).toBeGreaterThan(1 / OFFICE_FRAME_RATE);
        expect(frameTimes?.frameIndexAt(presentedLast)).toBe(last);
        expect(frameTimes?.frameIndexAt(seconds(timestamps[last - 1] ?? NaN))).toBe(last - 1);
      } finally {
        input.dispose();
        await source.close();
      }
    },
    TIMEOUT_MS,
  );
});
