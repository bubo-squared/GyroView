import { describe, expect, it } from 'vitest';

import { BrowserAttitudeSensor, type AttitudeSource } from './BrowserAttitudeSensor';
import { describeAttitudeSensorContract } from '../test/attitudeSensorContract';

interface Angles {
  readonly alpha: number | null;
  readonly beta: number | null;
  readonly gamma: number | null;
}

const UPRIGHT: Angles = { alpha: 0, beta: 90, gamma: 0 };
const WITHOUT_SENSOR: Angles = { alpha: null, beta: null, gamma: null };
const ORIENTATION_EVENT = 'deviceorientation';

/**
 * A window that counts the orientation listeners on it.
 */
class CountingTarget extends EventTarget {
  public listeners = 0;

  public override addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
  ): void {
    if (type === ORIENTATION_EVENT) this.listeners += 1;
    super.addEventListener(type, callback);
  }

  public override removeEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
  ): void {
    if (type === ORIENTATION_EVENT) this.listeners -= 1;
    super.removeEventListener(type, callback);
  }
}

/**
 * A browser like an older Chrome on a phone: orientation events, a touch screen, and no
 * permission to ask for.
 */
function sourceOn(target: EventTarget, changes: Partial<AttitudeSource> = {}): AttitudeSource {
  return {
    target,
    isSecureContext: true,
    orientationEvents: {},
    touchPoints: 5,
    screenAngle: () => 0,
    ...changes,
  };
}

/**
 * Whether this browser builds orientation events: WebKit on a desktop declares the class but
 * refuses to construct it.
 */
function canConstructOrientationEvents(): boolean {
  try {
    return new DeviceOrientationEvent(ORIENTATION_EVENT) instanceof Event;
  } catch {
    return false;
  }
}

function report(target: EventTarget, angles: Angles): void {
  target.dispatchEvent(Object.assign(new Event(ORIENTATION_EVENT), angles));
}

/**
 * iOS's orientation event class: its `requestPermission` answers as `answer` does, and says
 * whether it was called.
 */
function iosEvents(answer: () => Promise<string>): { events: object; wasAsked: () => boolean } {
  let wasCalled = false;
  const events = {
    requestPermission: (): Promise<string> => {
      wasCalled = true;
      return answer();
    },
  };
  return { events, wasAsked: () => wasCalled };
}

describeAttitudeSensorContract('browser', () => {
  const target = new EventTarget();
  return {
    sensor: new BrowserAttitudeSensor(sourceOn(target)),
    reportAttitude: (): void => {
      report(target, UPRIGHT);
    },
  };
});

describe('BrowserAttitudeSensor', () => {
  it('decides nothing on an event without angles, as Chromium sends where there is no sensor', () => {
    const target = new EventTarget();
    const sensor = new BrowserAttitudeSensor(sourceOn(target));
    report(target, WITHOUT_SENSOR);
    report(target, { ...UPRIGHT, alpha: null });
    expect(sensor.availability).toBe('unavailable');
    report(target, UPRIGHT);
    expect(sensor.availability).toBe('available');
  });

  it('probes once for every sensor on the page, and stops at the first reading', () => {
    const target = new CountingTarget();
    const sensors = [0, 1].map(() => new BrowserAttitudeSensor(sourceOn(target)));
    expect(sensors.map((sensor) => sensor.availability)).toEqual(['unavailable', 'unavailable']);
    expect(target.listeners).toBe(1);
    report(target, UPRIGHT);
    expect(sensors.map((sensor) => sensor.availability)).toEqual(['available', 'available']);
    expect(target.listeners).toBe(0);
  });

  it('reads the look through the screen and the time of each event', () => {
    const target = new EventTarget();
    const sensor = new BrowserAttitudeSensor(sourceOn(target, { screenAngle: () => 90 }));
    const readings: { yaw: number; pitch: number; roll: number; at: number }[] = [];
    sensor.listen(({ look, at }) => {
      readings.push({ ...look, at });
    });
    // Landscape, turned left, held upright.
    const event = Object.assign(new Event(ORIENTATION_EVENT), { alpha: 90, beta: 0, gamma: -90 });
    target.dispatchEvent(event);
    report(target, WITHOUT_SENSOR);
    expect(readings).toHaveLength(1);
    for (const angle of ['yaw', 'pitch', 'roll'] as const) {
      expect(readings[0]?.[angle]).toBeCloseTo(0, 9);
    }
    expect(readings[0]?.at).toBe(event.timeStamp);
  });

  it('grants access at once where the browser asks for no permission', async () => {
    const sensor = new BrowserAttitudeSensor(sourceOn(new EventTarget()));
    await expect(sensor.requestAccess()).resolves.toBe('granted');
  });

  it.each([
    { name: 'outside a secure context', changes: { isSecureContext: false } },
    { name: 'without orientation events', changes: { orientationEvents: undefined } },
  ])('is unavailable and refuses access $name', async ({ changes }) => {
    const target = new EventTarget();
    const sensor = new BrowserAttitudeSensor(sourceOn(target, changes));
    report(target, UPRIGHT);
    expect(sensor.availability).toBe('unavailable');
    await expect(sensor.requestAccess()).resolves.toBe('denied');
  });

  it('is available at once on iOS, and asks it for access within the call itself', async () => {
    const { events, wasAsked } = iosEvents(() => Promise.resolve('granted'));
    const sensor = new BrowserAttitudeSensor(
      sourceOn(new EventTarget(), { orientationEvents: events }),
    );
    expect(sensor.availability).toBe('available');
    const access = sensor.requestAccess();
    expect(wasAsked()).toBe(true);
    await expect(access).resolves.toBe('granted');
  });

  it("tells iOS's refusal from a request it would not take outside a user gesture", async () => {
    const refusing = iosEvents(() => Promise.resolve('denied'));
    const sensor = new BrowserAttitudeSensor(
      sourceOn(new EventTarget(), { orientationEvents: refusing.events }),
    );
    await expect(sensor.requestAccess()).resolves.toBe('denied');
    const gestureless = iosEvents(() =>
      Promise.reject(new DOMException('no gesture', 'NotAllowedError')),
    );
    const other = new BrowserAttitudeSensor(
      sourceOn(new EventTarget(), { orientationEvents: gestureless.events }),
    );
    await expect(other.requestAccess()).resolves.toBe('needs-gesture');
  });

  it('takes a desktop Chromium, which can ask but has no touch screen, as unavailable until the angles come', async () => {
    const target = new EventTarget();
    const { events, wasAsked } = iosEvents(() => Promise.resolve('prompt'));
    const sensor = new BrowserAttitudeSensor(
      sourceOn(target, { orientationEvents: events, touchPoints: 0 }),
    );
    expect(sensor.availability).toBe('unavailable');
    report(target, UPRIGHT);
    expect(sensor.availability).toBe('available');
    await expect(sensor.requestAccess()).resolves.toBe('granted');
    expect(wasAsked()).toBe(false);
  });

  it('takes a touch device that can ask as available until an event without the angles says otherwise', () => {
    const target = new EventTarget();
    const { events } = iosEvents(() => Promise.resolve('granted'));
    const sensor = new BrowserAttitudeSensor(sourceOn(target, { orientationEvents: events }));
    let changes = 0;
    sensor.onAvailabilityChange(() => {
      changes += 1;
    });
    expect(sensor.availability).toBe('available');
    report(target, WITHOUT_SENSOR);
    expect(sensor.availability).toBe('unavailable');
    expect(changes).toBe(1);
  });

  it("reads Chromium's answer outside a gesture as wanting one", async () => {
    const { events } = iosEvents(() => Promise.resolve('prompt'));
    const sensor = new BrowserAttitudeSensor(
      sourceOn(new EventTarget(), { orientationEvents: events }),
    );
    await expect(sensor.requestAccess()).resolves.toBe('needs-gesture');
  });

  it.runIf(canConstructOrientationEvents())("hears the page's own window", () => {
    const sensor = new BrowserAttitudeSensor();
    let heard = 0;
    const stop = sensor.listen(() => {
      heard += 1;
    });
    globalThis.dispatchEvent(new DeviceOrientationEvent(ORIENTATION_EVENT, UPRIGHT));
    stop();
    expect(sensor.availability).toBe('available');
    expect(heard).toBe(1);
  });

  it.runIf(!canConstructOrientationEvents())(
    'is unavailable on a desktop WebKit, which sends no orientation events',
    () => {
      expect(new BrowserAttitudeSensor().availability).toBe('unavailable');
    },
  );
});
