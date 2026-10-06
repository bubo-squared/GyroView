import {
  milliseconds,
  PlaybackSession,
  seconds,
  TypedEmitter,
  WallClock,
  type PlayerState,
} from '@gyroview/core';
import {
  FakeFrameSink,
  FakeVideoDecoderPort,
  FakeVideoTrack,
  type FakeFrameHandle,
} from '@gyroview/core/testing';
import { describe, expect, it, vi } from 'vitest';

import type { PlayerEvents } from './PlayerEvents';
import { SessionRelay } from './SessionRelay';

function idleSession(): PlaybackSession<FakeFrameHandle> {
  return new PlaybackSession<FakeFrameHandle>({
    frameSources: [0, 1].map(
      (trackIndex) =>
        new FakeVideoTrack({ trackIndex, frameRate: 10, frameCount: 10, framesPerGop: 10 }),
    ),
    decoderPort: new FakeVideoDecoderPort(),
    clock: new WallClock(() => milliseconds(0)),
    sink: new FakeFrameSink<FakeFrameHandle>(),
    duration: seconds(1),
    pipeline: { maxPendingPackets: 3, pairTolerance: seconds(0.0001) },
    queueCapacity: 4,
  });
}

interface Relaying {
  readonly relay: SessionRelay;
  readonly events: TypedEmitter<PlayerEvents>;
  readonly relayed: string[];
  readonly states: PlayerState[];
}

function relaying(session: PlaybackSession<FakeFrameHandle>): Relaying {
  const events = new TypedEmitter<PlayerEvents>();
  const relayed: string[] = [];
  const states: PlayerState[] = [];
  const relay = new SessionRelay({
    events,
    onState: (state): void => {
      states.push(state);
    },
  });
  relay.attach(session);
  for (const name of ['play', 'waiting', 'pause', 'seeking', 'seeked', 'frame'] as const) {
    events.on(name, () => {
      relayed.push(name);
    });
  }
  return { relay, events, relayed, states };
}

describe('SessionRelay', () => {
  it('relays a change whole, then the newer change a listener made on one of its events', async () => {
    const session = idleSession();
    const { events, relayed, states } = relaying(session);
    events.on('play', () => {
      session.pause();
    });
    await session.play();
    expect(relayed).toEqual(['play', 'waiting', 'pause']);
    expect(states).toEqual(['buffering', 'paused']);
    session.dispose();
  });

  it("cuts a change's events short when a listener lets the session go", () => {
    const session = idleSession();
    const { relay, events, relayed, states } = relaying(session);
    events.on('play', () => {
      relay.detach();
    });
    void session.play();
    expect(relayed).toEqual(['play']);
    expect(states).toEqual([]);
    session.dispose();
  });

  it('relays a seek done once the session drew its picture, then the state after it', async () => {
    const session = idleSession();
    const { relayed, states } = relaying(session);
    session.seek(seconds(0.5));
    expect(relayed).toEqual(['seeking']);
    await vi.waitUntil(() => relayed.includes('seeked'));
    expect(relayed).toEqual(['seeking', 'frame', 'seeked']);
    expect(states).toEqual(['seeking', 'paused', 'paused']);
    session.dispose();
  });
});
