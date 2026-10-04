import {
  degrees,
  milliseconds,
  screenLookOf,
  type DeviceAttitude,
  type DeviceReading,
} from '@gyroview/core';

import type { AttitudeAccess, AttitudeAvailability, AttitudeSensor } from './attitudeSensor';

/**
 * The event the browser reports the device's attitude with (W3C DeviceOrientation Event
 * Specification). Relative to where the device started, not to the north: no compass jumps.
 */
const ORIENTATION_EVENT = 'deviceorientation';

/**
 * What the sensor reads of the browser: the window its events reach, whether the page is a
 * secure context (the only place browsers report the attitude), the orientation event's class
 * where the browser has one (with a `requestPermission` on iOS, and in newer Chromium), how many
 * touch points the screen takes, and the screen's turn.
 */
export interface AttitudeSource {
  readonly target: EventTarget;
  readonly isSecureContext: boolean;
  readonly orientationEvents: object | undefined;
  readonly touchPoints: number;
  screenAngle(): number;
}

/**
 * The page's own window and screen, read when called, never when this module loads: Node
 * imports it with the player.
 */
export function browserAttitudeSource(): AttitudeSource {
  return {
    target: globalThis,
    isSecureContext: globalThis.isSecureContext,
    orientationEvents: 'DeviceOrientationEvent' in globalThis ? DeviceOrientationEvent : undefined,
    touchPoints: navigator.maxTouchPoints,
    // Safari before 16.4 has no `screen.orientation`; its content then stands upright.
    screenAngle: () => (globalThis.screen.orientation as ScreenOrientation | undefined)?.angle ?? 0,
  };
}

/**
 * The device's attitude through the browser's `deviceorientation` events.
 *
 * Browsers tell whether a device has the sensors in different ways, which the page's probe hears:
 * Chromium sends an event at once, with the angles on a phone and without them where there is no
 * sensor; iOS sends nothing until the viewer allows it, so a touch device whose browser asks for
 * that permission is taken to have the sensors until it says otherwise; a desktop WebKit sends
 * nothing at all. An unfocused cross-origin frame may hear nothing until a tap.
 */
export class BrowserAttitudeSensor implements AttitudeSensor {
  private readonly stops = new Set<() => void>();

  /**
   * Starts the page's probe, if no sensor before did, so it hears the event Chromium sends as
   * soon as anyone listens.
   */
  public constructor(private readonly source: AttitudeSource = browserAttitudeSource()) {
    if (this.canReport()) probeOf(source.target);
  }

  public get availability(): AttitudeAvailability {
    return this.isAvailable() ? 'available' : 'unavailable';
  }

  public onAvailabilityChange(listener: () => void): () => void {
    return this.track(probeOf(this.source.target).onChange(listener));
  }

  /**
   * Asks only where the events wait for an answer, and then before anything else, still within
   * the tap: an `await` before it would leave the gesture behind. Chromium answers `prompt`
   * outside a gesture, as iOS rejects the request there.
   */
  public async requestAccess(): Promise<AttitudeAccess> {
    if (!this.canReport()) return 'denied';
    const request = this.permissionRequest();
    if (!request || probeOf(this.source.target).heard === 'angles') return 'granted';
    try {
      return accessOf(await request());
    } catch {
      return 'needs-gesture';
    }
  }

  public listen(onReading: (reading: DeviceReading) => void): () => void {
    const { target } = this.source;
    const hear = (event: Event): void => {
      const attitude = attitudeOf(event, this.source.screenAngle());
      if (attitude) onReading({ look: screenLookOf(attitude), at: milliseconds(event.timeStamp) });
    };
    target.addEventListener(ORIENTATION_EVENT, hear);
    return this.track(() => {
      target.removeEventListener(ORIENTATION_EVENT, hear);
    });
  }

  public dispose(): void {
    for (const stop of this.stops) stop();
  }

  private isAvailable(): boolean {
    if (!this.canReport()) return false;
    const { heard } = probeOf(this.source.target);
    const canBeWithheld = this.permissionRequest() !== undefined && this.source.touchPoints > 0;
    return heard === 'angles' || (heard === 'nothing' && canBeWithheld);
  }

  private canReport(): boolean {
    return this.source.isSecureContext && this.source.orientationEvents !== undefined;
  }

  /**
   * The orientation event's `requestPermission`, which no standard type declares yet.
   */
  private permissionRequest(): (() => unknown) | undefined {
    const events = this.source.orientationEvents;
    const request: unknown =
      events === undefined ? undefined : Reflect.get(events, 'requestPermission');
    return typeof request === 'function'
      ? (): unknown => Reflect.apply(request, events, [])
      : undefined;
  }

  /**
   * A stop that also forgets itself, so `dispose` stops what is still running and nothing else.
   */
  private track(stop: () => void): () => void {
    const once = (): void => {
      if (this.stops.delete(once)) stop();
    };
    this.stops.add(once);
    return once;
  }
}

function accessOf(answer: unknown): AttitudeAccess {
  if (answer === 'granted') return 'granted';
  return answer === 'denied' ? 'denied' : 'needs-gesture';
}

/**
 * The attitude an orientation event carries, or none when the browser sends one without its
 * angles.
 */
function attitudeOf(event: Event, screenAngle: number): DeviceAttitude | undefined {
  const { alpha, beta, gamma } = event as Partial<DeviceOrientationEvent>;
  return typeof alpha === 'number' && typeof beta === 'number' && typeof gamma === 'number'
    ? {
        alpha: degrees(alpha),
        beta: degrees(beta),
        gamma: degrees(gamma),
        screenAngle: degrees(screenAngle),
      }
    : undefined;
}

/**
 * What the page's probe has heard: nothing yet, an event without the angles (no sensor), or
 * the angles.
 */
type Heard = 'nothing' | 'no-angles' | 'angles';

/**
 * Listens once for every player on the page until it hears the angles, then stops: on a phone
 * they come at once; where nothing comes, listening costs nothing.
 */
class AttitudeProbe {
  private heardValue: Heard = 'nothing';
  private readonly listeners = new Set<() => void>();

  public constructor(private readonly target: EventTarget) {
    target.addEventListener(ORIENTATION_EVENT, this.hear);
  }

  public get heard(): Heard {
    return this.heardValue;
  }

  public onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private readonly hear = (event: Event): void => {
    const heard = attitudeOf(event, 0) ? 'angles' : 'no-angles';
    if (heard === 'angles') this.target.removeEventListener(ORIENTATION_EVENT, this.hear);
    if (heard === this.heardValue) return;
    this.heardValue = heard;
    for (const listener of this.listeners) listener();
  };
}

const probes = new WeakMap<EventTarget, AttitudeProbe>();

function probeOf(target: EventTarget): AttitudeProbe {
  let probe = probes.get(target);
  if (!probe) {
    probe = new AttitudeProbe(target);
    probes.set(target, probe);
  }
  return probe;
}
