import type { DeviceReading } from '@gyroview/core';

/**
 * Whether the device reports its attitude, as far as the browser has said so far.
 */
export type AttitudeAvailability = 'available' | 'unavailable';

/**
 * How a request to read the attitude ended: allowed, refused (by the viewer, or by a frame whose
 * `allow` leaves the sensors out), or not asked at all for want of a user gesture.
 */
export type AttitudeAccess = 'granted' | 'denied' | 'needs-gesture';

/**
 * The device's attitude, read for motion look (ADR 0040): the player owns this port, the
 * composition gives it the browser's.
 */
export interface AttitudeSensor {
  readonly availability: AttitudeAvailability;
  /**
   * Hears each change of `availability` until the returned function is called.
   */
  onAvailabilityChange(listener: () => void): () => void;
  /**
   * Asks to read the attitude. Called first thing in a tap's handler: iOS asks the viewer there,
   * and refuses a request made outside a user gesture.
   */
  requestAccess(): Promise<AttitudeAccess>;
  /**
   * Hears each reading until the returned function is called.
   */
  listen(onReading: (reading: DeviceReading) => void): () => void;
  /**
   * Stops every listener.
   */
  dispose(): void;
}

/**
 * What a listener that never started returns to stop it.
 */
export const NOTHING_TO_STOP = (): void => undefined;

/**
 * A device without the sensors, or a player composed without them: motion look stays
 * unavailable.
 */
export const NO_ATTITUDE_SENSOR: AttitudeSensor = {
  availability: 'unavailable',
  onAvailabilityChange: () => NOTHING_TO_STOP,
  requestAccess: () => Promise.resolve('denied'),
  listen: () => NOTHING_TO_STOP,
  dispose: NOTHING_TO_STOP,
};
