import { degrees, milliseconds, type DeviceReading } from '@gyroview/core';
import type { AttitudeSensor } from '@gyroview/player/composition';

/**
 * How often a phone's browser reports its attitude: about once a display frame.
 */
const READING_INTERVAL_MS = 16;
const MILLISECONDS_PER_SECOND = 1000;

/**
 * The constants of glibc's `rand`, a linear congruential generator: modulus 2^31.
 */
const LCG_MULTIPLIER = 1_103_515_245;
const LCG_INCREMENT = 12_345;
const LCG_MODULUS = 2_147_483_648;

/**
 * The scripted device is always available: nothing to stop hearing.
 */
const NO_CHANGE_TO_HEAR = (): void => undefined;

/**
 * Where the device looks at a time, in degrees: yaw, pitch and roll.
 */
export type AttitudeMotion = (seconds: number) => readonly [number, number, number];

/**
 * A device whose readings a measurement scripts: `readingsPerInterval` readings every 16 ms, as
 * a phone sends them between frames, more than one standing for a browser that sends faster than
 * the display draws. It times what hearing each reading costs the page.
 */
export class ScriptedAttitudeSensor implements AttitudeSensor {
  public readonly availability = 'available';
  public readonly readingMs: number[] = [];
  private readonly timers = new Set<ReturnType<typeof setInterval>>();

  public constructor(
    private readonly motion: AttitudeMotion,
    private readonly readingsPerInterval: number,
  ) {}

  public onAvailabilityChange(): () => void {
    return NO_CHANGE_TO_HEAR;
  }

  public requestAccess(): Promise<'granted'> {
    return Promise.resolve('granted');
  }

  public listen(onReading: (reading: DeviceReading) => void): () => void {
    const timer = setInterval(() => {
      for (let index = 0; index < this.readingsPerInterval; index += 1) {
        this.report(onReading);
      }
    }, READING_INTERVAL_MS);
    this.timers.add(timer);
    return () => {
      clearInterval(timer);
      this.timers.delete(timer);
    };
  }

  public dispose(): void {
    for (const timer of this.timers) clearInterval(timer);
    this.timers.clear();
  }

  private report(onReading: (reading: DeviceReading) => void): void {
    const at = performance.now();
    const [yaw, pitch, roll] = this.motion(at / MILLISECONDS_PER_SECOND);
    const reading = {
      look: { yaw: degrees(yaw), pitch: degrees(pitch), roll: degrees(roll) },
      at: milliseconds(at),
    };
    onReading(reading);
    this.readingMs.push(performance.now() - at);
  }
}

/**
 * A repeatable jitter in [-1, 1]: a linear congruential generator, so every run shakes alike.
 */
export function jitter(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * LCG_MULTIPLIER + LCG_INCREMENT) % LCG_MODULUS;
    return (state / LCG_MODULUS) * 2 - 1;
  };
}
