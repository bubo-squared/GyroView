import type { DeviceReading, EventSink } from '@gyroview/core';

import type { MotionLookState, PlayerEvents } from './PlayerEvents';
import type { AttitudeAccess, AttitudeSensor } from '../composition/attitudeSensor';

/**
 * The view the device turns: whether its mode follows the device, and the hold on it.
 */
export interface HeldView {
  readonly followsDevice: boolean;
  followDevice(reading: DeviceReading): void;
  letGo(): void;
}

export interface MotionLookParts {
  readonly sensor: AttitudeSensor;
  readonly view: HeldView;
  readonly events: EventSink<PlayerEvents>;
  /**
   * Whether a recording is drawn: the sensor is heard only while one is.
   */
  readonly hasRecording: () => boolean;
}

/**
 * The motion look setting, kept across loads like the others (ADR 0016), and when the device is
 * heard: only while it is on, a recording is drawn and the view mode follows the device. Each
 * time hearing stops, the view is let go, so it is level again everywhere else.
 */
export class MotionLook {
  private stateValue: MotionLookState;
  private request: Promise<MotionLookState> | undefined;
  /**
   * Counts the requests `stop` and `dispose` overtook: an answer that comes after them changes
   * nothing.
   */
  private generation = 0;
  private stopHearing: (() => void) | undefined;
  private readonly stopFollowingAvailability: () => void;
  /**
   * The viewer refused access: the device's availability changes nothing after that.
   */
  private wasRefused = false;

  public constructor(private readonly parts: MotionLookParts) {
    const { sensor } = parts;
    this.stateValue = sensor.availability === 'available' ? 'off' : 'unavailable';
    this.stopFollowingAvailability = sensor.onAvailabilityChange(() => {
      this.followAvailability();
    });
  }

  public get state(): MotionLookState {
    return this.stateValue;
  }

  /**
   * Turns motion look on, asking for access first; resolves with the state it ends in and never
   * rejects. A second call while the first asks waits for the same answer.
   */
  public start(): Promise<MotionLookState> {
    if (this.stateValue !== 'off') return Promise.resolve(this.stateValue);
    this.request ??= this.ask();
    return this.request;
  }

  public stop(): void {
    this.generation += 1;
    this.request = undefined;
    if (this.stateValue === 'on') this.change('off');
    this.reconsider();
  }

  /**
   * Hears the device exactly while motion look is on, a recording is drawn and the view mode
   * follows the device; the player calls it whenever one of those may have changed.
   */
  public reconsider(): void {
    const { sensor, view, hasRecording } = this.parts;
    const shouldHear = this.stateValue === 'on' && hasRecording() && view.followsDevice;
    if (shouldHear && !this.stopHearing) {
      this.stopHearing = sensor.listen((reading) => {
        view.followDevice(reading);
      });
    } else if (!shouldHear && this.stopHearing) {
      this.stopHearing();
      this.stopHearing = undefined;
      view.letGo();
    }
  }

  public dispose(): void {
    this.generation += 1;
    this.stopHearing?.();
    this.stopHearing = undefined;
    this.stopFollowingAvailability();
    this.parts.sensor.dispose();
  }

  /**
   * A device found to report its attitude after all may be turned on; one found not to, which
   * may happen after it was turned on, can no longer be.
   */
  private followAvailability(): void {
    const isAvailable = this.parts.sensor.availability === 'available';
    if (this.wasRefused || isAvailable === (this.stateValue !== 'unavailable')) return;
    this.generation += 1;
    this.request = undefined;
    this.change(isAvailable ? 'off' : 'unavailable');
    this.reconsider();
  }

  private async ask(): Promise<MotionLookState> {
    const generation = this.generation;
    const access = await this.parts.sensor.requestAccess();
    if (generation !== this.generation) return this.stateValue;
    this.request = undefined;
    this.answer(access);
    return this.stateValue;
  }

  private answer(access: AttitudeAccess): void {
    if (access === 'granted') {
      this.change('on');
      this.reconsider();
    } else if (access === 'denied') {
      this.wasRefused = true;
      this.change('unavailable');
      this.warn('motion-look-refused', REFUSED);
    } else {
      this.warn('motion-look-needs-gesture', NEEDS_GESTURE);
    }
  }

  private change(state: MotionLookState): void {
    this.stateValue = state;
    this.parts.events.emit('motionlookchange', state);
  }

  private warn(code: 'motion-look-refused' | 'motion-look-needs-gesture', message: string): void {
    this.parts.events.emit('warning', { code, message });
  }
}

const REFUSED =
  'motion look was refused: by the viewer, or by an iframe whose `allow` leaves out accelerometer, gyroscope and magnetometer';
const NEEDS_GESTURE =
  'motion look asks for access, which this browser grants only from a user gesture such as a tap';
