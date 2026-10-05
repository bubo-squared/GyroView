import { Deferred, degrees, milliseconds, type DeviceReading } from '@gyroview/core';

import type {
  AttitudeAccess,
  AttitudeAvailability,
  AttitudeSensor,
} from '../composition/attitudeSensor';

/**
 * A device whose attitude a test reports: available or not, granting or refusing access, at
 * once or when the test answers.
 */
export class FakeAttitudeSensor implements AttitudeSensor {
  public availability: AttitudeAvailability;
  /**
   * What the next request ends in; `held` keeps it waiting for `answer`.
   */
  public access: AttitudeAccess | 'held' = 'granted';
  public requests = 0;
  private readonly availabilityListeners = new Set<() => void>();
  private readonly listeners = new Set<(reading: DeviceReading) => void>();
  private heldAnswer: Deferred<AttitudeAccess> | undefined;

  public constructor(availability: AttitudeAvailability = 'available') {
    this.availability = availability;
  }

  public get listenerCount(): number {
    return this.listeners.size;
  }

  public get availabilityListenerCount(): number {
    return this.availabilityListeners.size;
  }

  public onAvailabilityChange(listener: () => void): () => void {
    this.availabilityListeners.add(listener);
    return () => {
      this.availabilityListeners.delete(listener);
    };
  }

  public requestAccess(): Promise<AttitudeAccess> {
    this.requests += 1;
    if (this.access !== 'held') return Promise.resolve(this.access);
    this.heldAnswer = new Deferred();
    return this.heldAnswer.promise;
  }

  public listen(onReading: (reading: DeviceReading) => void): () => void {
    this.listeners.add(onReading);
    return () => {
      this.listeners.delete(onReading);
    };
  }

  public dispose(): void {
    this.availabilityListeners.clear();
    this.listeners.clear();
  }

  public changeAvailability(availability: AttitudeAvailability): void {
    if (availability === this.availability) return;
    this.availability = availability;
    for (const listener of this.availabilityListeners) listener();
  }

  public answer(access: AttitudeAccess): void {
    this.heldAnswer?.resolve(access);
  }

  /**
   * The device looking at yaw, pitch and roll, in degrees, read at `at` milliseconds: available
   * from then on, as a browser's first reading shows.
   */
  public report(at: number, [yaw, pitch, roll]: readonly [number, number, number]): void {
    this.changeAvailability('available');
    const reading = {
      look: { yaw: degrees(yaw), pitch: degrees(pitch), roll: degrees(roll) },
      at: milliseconds(at),
    };
    for (const listener of this.listeners) listener(reading);
  }
}
