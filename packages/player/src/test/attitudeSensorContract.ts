import { describe, expect, it } from 'vitest';

import type { AttitudeSensor } from '../composition/attitudeSensor';

/**
 * A sensor under test, and a way to make its device report: with all three angles, or without
 * them as Chromium does where there is no sensor.
 */
export interface AttitudeSensorUnderTest {
  readonly sensor: AttitudeSensor;
  readonly reportAttitude: () => void;
}

/**
 * Behaviour every attitude sensor must exhibit: the fake and the browser's alike.
 */
export function describeAttitudeSensorContract(
  name: string,
  open: () => AttitudeSensorUnderTest,
): void {
  describe(`AttitudeSensor contract (${name})`, () => {
    it('becomes available at the first reading, and says so once', () => {
      const { sensor, reportAttitude } = open();
      expect(sensor.availability).toBe('unavailable');
      let heard = 0;
      sensor.onAvailabilityChange(() => {
        heard += 1;
      });
      reportAttitude();
      reportAttitude();
      expect(sensor.availability).toBe('available');
      expect(heard).toBe(1);
    });

    it('hears each reading until it stops listening', () => {
      const { sensor, reportAttitude } = open();
      let heard = 0;
      const stop = sensor.listen(() => {
        heard += 1;
      });
      reportAttitude();
      reportAttitude();
      stop();
      reportAttitude();
      expect(heard).toBe(2);
    });

    it('hears nothing more once disposed, not even a change of availability', () => {
      const { sensor, reportAttitude } = open();
      let heard = 0;
      sensor.listen(() => {
        heard += 1;
      });
      sensor.onAvailabilityChange(() => {
        heard += 1;
      });
      sensor.dispose();
      reportAttitude();
      expect(heard).toBe(0);
    });
  });
}
