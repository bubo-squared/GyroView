import { describe, expect, it } from 'vitest';

import { seconds } from '../../shared/units/time';
import { DURATION, FRAME_RATE, sessionHarness } from '../../../test/support/sessionHarness';
import { settle } from '../../../test/support/settle';

const FRAME = 1 / FRAME_RATE;

describe('PlaybackSession transport', () => {
  it('is ready after construction and presents frames in step with the clock once playing', async () => {
    const { session, sink, advance } = sessionHarness();
    expect(session.state).toBe('ready');
    await session.play();
    expect(session.state).toBe('playing');
    await advance(0);
    await advance(250);
    await advance(300);
    expect(sink.presentations.map((presentation) => presentation.pair.timestamp)).toEqual([
      0, 0.2, 0.5,
    ]);
    expect(sink.presentations.at(-1)?.mediaTime).toBe(0.55);
    session.dispose();
  });

  it('announces every pair it presents, at the media time it was presented', async () => {
    const { session, sink, advance } = sessionHarness();
    const announced: number[] = [];
    session.events.on('present', (time) => {
      announced.push(time);
    });
    await session.play();
    await advance(0);
    await advance(250);
    expect(announced).toEqual(sink.presentations.map((presentation) => presentation.mediaTime));
    expect(announced).toHaveLength(2);
    session.dispose();
  });

  it('draws the pair on screen again on request while the picture stands still', async () => {
    const { session, sink, advance } = sessionHarness();
    session.redraw();
    expect(sink.presentations).toEqual([]);
    await session.play();
    await advance(0);
    session.redraw();
    expect(sink.presentations).toHaveLength(1);
    session.pause();
    session.redraw();
    expect(sink.presentations).toHaveLength(2);
    expect(sink.presentations[1]).toBe(sink.presentations[0]);
    session.dispose();
  });

  it('closes superseded pairs and keeps only the presented one open', async () => {
    const { session, decoderPort, advance } = sessionHarness();
    await session.play();
    for (let step = 0; step < 6; step += 1) await advance(150);
    expect(decoderPort.openFrames).toBeLessThanOrEqual(2 + 2 * 4 + 2 * 3);
    session.dispose();
    expect(decoderPort.openFrames).toBe(0);
  });

  it('pauses and resumes with the same pipeline, presenting nothing stale and no time updates while paused', async () => {
    const { session, sink, decoderPort, advance } = sessionHarness();
    const updates: number[] = [];
    session.events.on('timeupdate', (time) => {
      updates.push(time);
    });
    await session.play();
    await advance(300);
    session.pause();
    expect(session.state).toBe('paused');
    const shownWhilePaused = sink.presentations.length;
    const updatesWhilePaused = updates.length;
    await advance(1000);
    expect(sink.presentations.length).toBe(shownWhilePaused);
    expect(updates.length).toBe(updatesWhilePaused);
    await session.play();
    await advance(300);
    expect(sink.lastTimestamp).toBeCloseTo(0.6, 6);
    expect(decoderPort.decodersCreated).toHaveLength(2);
    expect(updates.length).toBe(updatesWhilePaused + 1);
    session.dispose();
  });

  it('announces its time every quarter second of playback, and on a pause and a seek', async () => {
    const { session, advance } = sessionHarness();
    const updates: number[] = [];
    session.events.on('timeupdate', (time) => {
      updates.push(time);
    });
    await session.play();
    for (let step = 0; step < 5; step += 1) await advance(100);
    session.pause();
    session.seek(seconds(2));
    expect(updates.map((time) => Number(time.toFixed(6)))).toEqual([0.1, 0.4, 0.5, 2]);
    session.dispose();
  });

  it('settles a second play while buffering with the first, once the clock runs', async () => {
    const { session, clock } = sessionHarness();
    const first = session.play();
    expect(session.state).toBe('buffering');
    let wasClockRunningWhenSettled = false;
    const second = (async (): Promise<void> => {
      await session.play();
      wasClockRunningWhenSettled = clock.isRunning;
    })();
    await first;
    await second;
    expect(wasClockRunningWhenSettled).toBe(true);
    expect(session.state).toBe('playing');
    session.dispose();
  });

  it('calling play while playing changes nothing', async () => {
    const { session, decoderPort, states } = sessionHarness();
    await session.play();
    await session.play();
    await settle();
    expect(states).toEqual(['buffering', 'playing']);
    expect(decoderPort.decodersCreated).toHaveLength(2);
    session.dispose();
  });

  it('seeks to a time and presents from there, never a frame before the target', async () => {
    const { session, sink, advance } = sessionHarness();
    await session.play();
    await advance(100);
    session.seek(seconds(2.05));
    await advance(0);
    await advance(0);
    expect(sink.lastTimestamp).toBeCloseTo(2, 6);
    await advance(160);
    expect(
      sink.presentations.every(
        (presentation) => presentation.pair.timestamp >= 2 || presentation.mediaTime < 0.2,
      ),
    ).toBe(true);
    expect(session.state).toBe('playing');
    session.dispose();
  });

  it('seeking while paused stays paused and shows the target frame', async () => {
    const { session, sink, advance, states } = sessionHarness();
    session.seek(seconds(1));
    await advance(0);
    await advance(0);
    expect(session.state).toBe('paused');
    expect(sink.lastTimestamp).toBe(1);
    expect(states).toEqual(['seeking', 'paused']);
    session.dispose();
  });

  it('clamps seeks into the recording and shows the last frame at the duration without ending', async () => {
    const { session, sink, advance } = sessionHarness();
    session.seek(seconds(-5));
    expect(session.currentTime).toBe(0);
    session.seek(seconds(10));
    expect(session.currentTime).toBe(DURATION);
    await advance(0);
    await advance(0);
    expect(sink.lastTimestamp).toBeCloseTo(DURATION - FRAME, 6);
    expect(session.state).toBe('paused');
    session.dispose();
  });

  it('leaves exactly one live pipeline after a burst of seeks', async () => {
    const { session, decoderPort, advance } = sessionHarness();
    await session.play();
    await advance(50);
    for (const target of [0.5, 1.2, 2.7, 0.1, 1.9]) session.seek(seconds(target));
    await advance(0);
    await advance(50);
    expect(decoderPort.openDecoders).toBe(2);
    expect(decoderPort.decodersCreated.length).toBeGreaterThan(2);
    session.dispose();
    await settle();
    expect(decoderPort.openFrames).toBe(0);
    expect(decoderPort.openDecoders).toBe(0);
  });

  it('ends when the clock passes the duration and every frame was shown, then can replay', async () => {
    const { session, clock, advance, states } = sessionHarness();
    const heard: (number | 'ended')[] = [];
    session.events.on('timeupdate', (time) => {
      heard.push(time);
    });
    session.events.on('ended', () => {
      heard.push('ended');
    });
    await session.play();
    for (let step = 0; step < 40; step += 1) await advance(100);
    expect(session.state).toBe('ended');
    const held = clock.currentTime;
    expect(held).toBeGreaterThanOrEqual(DURATION);
    expect(heard.filter((event) => event === 'ended')).toHaveLength(1);
    expect(heard.slice(-2)).toEqual([held, 'ended']);
    await advance(300);
    expect(clock.currentTime).toBe(held);
    await session.play();
    expect(session.state).toBe('playing');
    expect(session.currentTime).toBeLessThan(0.1);
    expect(states.filter((state) => state === 'ended')).toHaveLength(1);
    session.dispose();
  });

  it('does not end while decoded frames are still due, even with the clock past the duration', async () => {
    const { session, advance } = sessionHarness();
    await session.play();
    for (let step = 0; step < 22; step += 1) await advance(100);
    // Past the 3 s duration, with the last frames not decoded yet: it waits for them.
    await advance(900);
    expect(session.state).toBe('buffering');
    await settle();
    session.dispose();
  });

  it('stop pauses first and returns to the start, also from the ended state', async () => {
    const { session, sink, advance, states } = sessionHarness();
    await session.play();
    await advance(500);
    session.stop();
    await advance(0);
    expect(session.state).toBe('paused');
    expect(session.currentTime).toBe(0);
    expect(sink.lastTimestamp).toBe(0);
    expect(states.slice(-3)).toEqual(['paused', 'seeking', 'paused']);
    await session.play();
    for (let step = 0; step < 40; step += 1) await advance(100);
    expect(session.state).toBe('ended');
    session.stop();
    expect(session.state).toBe('paused');
    expect(session.currentTime).toBe(0);
    session.dispose();
  });
});
