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
 * The motion look setting, kept across loads like the others (ADR 0016), and what of the device
 * it hears: its availability while a recording is drawn, and its readings while motion look is
 * also on and the view mode follows the device. Each time the readings stop, the view is let go,
 * so it is level again everywhere else. Nothing of the page holds the player between recordings:
 * an element taken out of the page unloads, and can be collected.
 */
export class MotionLook {
  private stateValue: MotionLookState;
  private request: Promise<MotionLookState> | undefined;
  /**
   * Counts the requests `stop`, `dispose` and a change of availability overtook: an answer that
   * comes after them changes nothing.
   */
  private generation = 0;
  private stopHearing: (() => void) | undefined;
  private stopFollowingAvailability: (() => void) | undefined;
  /**
   * The viewer refused access: the device's availability changes nothing after that.
   */
  private wasRefused = false;

  public constructor(private readonly parts: MotionLookParts) {
    this.stateValue = parts.sensor.availability === 'available' ? 'off' : 'unavailable';
  }

  /**
   * As last known: the device's availability is followed while a recording is drawn.
   */
  public get state(): MotionLookState {
    return this.stateValue;
  }

  /**
   * Turns motion look on, asking for access first; resolves with the state it ends in and never
   * rejects. A second call while the first asks waits for the same answer.
   */
  public start(): Promise<MotionLookState> {
    this.followAvailability();
    if (this.stateValue !== 'off') return Promise.resolve(this.stateValue);
    this.request ??= this.ask();
    return this.request;
  }

  public stop(): void {
    this.overtakeRequest();
    if (this.stateValue === 'on') this.change('off');
  }

  /**
   * The player calls it whenever a recording or the view mode may have changed.
   */
  public reconsider(): void {
    this.reconsiderAvailability();
    this.reconsiderHearing();
  }

  public dispose(): void {
    this.overtakeRequest();
    this.stopFollowingAvailability?.();
    this.stopFollowingAvailability = undefined;
    this.stopHearing?.();
    this.stopHearing = undefined;
    this.parts.sensor.dispose();
  }

  private reconsiderAvailability(): void {
    const isDrawn = this.parts.hasRecording();
    if (isDrawn && !this.stopFollowingAvailability) {
      this.stopFollowingAvailability = this.parts.sensor.onAvailabilityChange(() => {
        this.followAvailability();
      });
      this.followAvailability();
    } else if (!isDrawn && this.stopFollowingAvailability) {
      this.stopFollowingAvailability();
      this.stopFollowingAvailability = undefined;
    }
  }

  /**
   * Hears the device exactly while motion look is on, a recording is drawn and the view mode
   * follows the device; lets the view go whenever it stops.
   */
  private reconsiderHearing(): void {
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

  /**
   * A device found to report its attitude after all may be turned on; one found not to, which
   * may happen after it was turned on, can no longer be.
   */
  private followAvailability(): void {
    const isAvailable = this.parts.sensor.availability === 'available';
    if (this.wasRefused || isAvailable === (this.stateValue !== 'unavailable')) return;
    this.overtakeRequest();
    this.change(isAvailable ? 'off' : 'unavailable');
  }

  private async ask(): Promise<MotionLookState> {
    const generation = this.generation;
    const access = await this.accessOrGesture();
    if (generation !== this.generation) return this.stateValue;
    this.request = undefined;
    this.answer(access);
    return this.stateValue;
  }

  /**
   * A sensor's request never rejects; one that did is taken as wanting a gesture, so motion look
   * may still be started from the next tap.
   */
  private async accessOrGesture(): Promise<AttitudeAccess> {
    try {
      return await this.parts.sensor.requestAccess();
    } catch {
      return 'needs-gesture';
    }
  }

  private answer(access: AttitudeAccess): void {
    if (access === 'granted') {
      this.change('on');
    } else if (access === 'denied') {
      this.wasRefused = true;
      this.change('unavailable');
      this.warn('motion-look-refused', REFUSED);
    } else {
      this.warn('motion-look-needs-gesture', NEEDS_GESTURE);
    }
  }

  private overtakeRequest(): void {
    this.generation += 1;
    this.request = undefined;
  }

  /**
   * Announced once the change is whole (ADR 0021): the device heard, or let go, first.
   */
  private change(state: MotionLookState): void {
    this.stateValue = state;
    this.reconsiderHearing();
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
