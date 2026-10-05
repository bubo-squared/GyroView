import { TypedEmitter, type DeviceReading } from '@gyroview/core';
import { describe, expect, it } from 'vitest';

import { MotionLook, type HeldView } from './MotionLook';
import type { MotionLookState, PlayerEvents, WarningCode } from './PlayerEvents';
import { FakeAttitudeSensor } from '../test/FakeAttitudeSensor';
import { settle } from '../test/waiting';

/**
 * A view that records what the device does to it, in a mode that follows the device or not.
 */
class RecordingView implements HeldView {
  public followsDevice = true;
  public readonly readings: DeviceReading[] = [];
  public lettingGo = 0;

  public followDevice(reading: DeviceReading): void {
    this.readings.push(reading);
  }

  public letGo(): void {
    this.lettingGo += 1;
  }
}

interface Rig {
  readonly motion: MotionLook;
  readonly sensor: FakeAttitudeSensor;
  readonly view: RecordingView;
  readonly states: MotionLookState[];
  readonly warnings: WarningCode[];
  readonly recording: { isDrawn: boolean };
  readonly events: TypedEmitter<PlayerEvents>;
}

function rig(sensor = new FakeAttitudeSensor()): Rig {
  const events = new TypedEmitter<PlayerEvents>();
  const states: MotionLookState[] = [];
  const warnings: WarningCode[] = [];
  events.on('motionlookchange', (state) => {
    states.push(state);
  });
  events.on('warning', ({ code }) => {
    warnings.push(code);
  });
  const view = new RecordingView();
  const recording = { isDrawn: true };
  const motion = new MotionLook({
    sensor,
    view,
    events,
    hasRecording: (): boolean => recording.isDrawn,
  });
  // As the player does once a recording is drawn.
  motion.reconsider();
  return { motion, sensor, view, states, warnings, recording, events };
}

describe('MotionLook', () => {
  it('starts off where the device reports its attitude, unavailable elsewhere until it does', () => {
    expect(rig().motion.state).toBe('off');
    const { motion, sensor, states } = rig(new FakeAttitudeSensor('unavailable'));
    expect(motion.state).toBe('unavailable');
    sensor.changeAvailability('available');
    expect(motion.state).toBe('off');
    expect(states).toEqual(['off']);
  });

  it('becomes unavailable when the device turns out to have no sensor, even once on', async () => {
    const { motion, sensor, view, states } = rig();
    await motion.start();
    sensor.changeAvailability('unavailable');
    expect(states).toEqual(['on', 'unavailable']);
    expect(sensor.listenerCount).toBe(0);
    expect(view.lettingGo).toBe(1);
  });

  it('follows the availability only while a recording is drawn, holding nothing of the page between', () => {
    const { motion, sensor, recording, states } = rig(new FakeAttitudeSensor('unavailable'));
    expect(sensor.availabilityListenerCount).toBe(1);
    recording.isDrawn = false;
    motion.reconsider();
    expect(sensor.availabilityListenerCount).toBe(0);
    sensor.changeAvailability('available');
    expect(states).toEqual([]);
    recording.isDrawn = true;
    motion.reconsider();
    expect(states).toEqual(['off']);
    expect(sensor.availabilityListenerCount).toBe(1);
  });

  it('reads the availability afresh when started', async () => {
    const { motion, sensor, recording } = rig(new FakeAttitudeSensor('unavailable'));
    recording.isDrawn = false;
    motion.reconsider();
    sensor.availability = 'available';
    await expect(motion.start()).resolves.toBe('on');
  });

  it('ignores an answer that a change of availability overtook', async () => {
    const { motion, sensor } = rig();
    sensor.access = 'held';
    const started = motion.start();
    sensor.changeAvailability('unavailable');
    sensor.answer('granted');
    await expect(started).resolves.toBe('unavailable');
    expect(sensor.listenerCount).toBe(0);
  });

  it('stays off when the sensor rejects, as if a gesture were wanted, and can start again', async () => {
    const sensor = new FakeAttitudeSensor();
    sensor.requestAccess = (): Promise<'granted'> => Promise.reject(new Error('broken'));
    const { motion, warnings } = rig(sensor);
    await expect(motion.start()).resolves.toBe('off');
    expect(warnings).toEqual(['motion-look-needs-gesture']);
  });

  it('announces each change once it is whole: the device heard, or let go', async () => {
    const { motion, sensor, events } = rig();
    const hearingWhenAnnounced: number[] = [];
    events.on('motionlookchange', () => {
      hearingWhenAnnounced.push(sensor.listenerCount);
    });
    await motion.start();
    motion.stop();
    expect(hearingWhenAnnounced).toEqual([1, 0]);
  });

  it('stays unavailable after a refusal, whatever the device says later', async () => {
    const { motion, sensor } = rig();
    sensor.access = 'denied';
    await motion.start();
    sensor.changeAvailability('unavailable');
    sensor.changeAvailability('available');
    expect(motion.state).toBe('unavailable');
  });

  it('turns on once access is granted, and hears the device', async () => {
    const { motion, sensor, view, states } = rig();
    await expect(motion.start()).resolves.toBe('on');
    sensor.report(0, [10, 0, 0]);
    expect(states).toEqual(['on']);
    expect(view.readings).toHaveLength(1);
  });

  it('is unavailable after a refusal, with a warning, and never rejects', async () => {
    const { motion, sensor, states, warnings } = rig();
    sensor.access = 'denied';
    await expect(motion.start()).resolves.toBe('unavailable');
    expect(states).toEqual(['unavailable']);
    expect(warnings).toEqual(['motion-look-refused']);
  });

  it('stays off, with a warning, when started outside a user gesture', async () => {
    const { motion, sensor, states, warnings } = rig();
    sensor.access = 'needs-gesture';
    await expect(motion.start()).resolves.toBe('off');
    expect(states).toEqual([]);
    expect(warnings).toEqual(['motion-look-needs-gesture']);
  });

  it('asks once for two starts while the first waits for its answer', async () => {
    const { motion, sensor } = rig();
    sensor.access = 'held';
    const first = motion.start();
    const second = motion.start();
    sensor.answer('granted');
    await expect(Promise.all([first, second])).resolves.toEqual(['on', 'on']);
    expect(sensor.requests).toBe(1);
  });

  it('ignores an answer that a stop overtook', async () => {
    const { motion, sensor, states } = rig();
    sensor.access = 'held';
    const started = motion.start();
    motion.stop();
    sensor.answer('granted');
    await expect(started).resolves.toBe('off');
    await settle();
    expect(motion.state).toBe('off');
    expect(states).toEqual([]);
    expect(sensor.listenerCount).toBe(0);
  });

  it('hears the device only while on, a recording is drawn and the mode follows the device', async () => {
    const { motion, sensor, view, recording } = rig();
    recording.isDrawn = false;
    await motion.start();
    expect(sensor.listenerCount).toBe(0);
    recording.isDrawn = true;
    motion.reconsider();
    expect(sensor.listenerCount).toBe(1);
    view.followsDevice = false;
    motion.reconsider();
    expect(sensor.listenerCount).toBe(0);
    expect(view.lettingGo).toBe(1);
  });

  it('lets go of the view when stopped, and stops hearing for good when disposed', async () => {
    const { motion, sensor, view, states } = rig();
    await motion.start();
    motion.stop();
    expect(states).toEqual(['on', 'off']);
    expect(view.lettingGo).toBe(1);
    expect(sensor.listenerCount).toBe(0);
    await motion.start();
    motion.dispose();
    expect(sensor.listenerCount).toBe(0);
  });
});
