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
import { describe, expect, it } from 'vitest';

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

function ignoreEnd(): void {
  // The session is paused long before its end.
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
    onEnded: ignoreEnd,
  });
  relay.attach(session);
  for (const name of ['play', 'waiting', 'pause'] as const) {
    events.on(name, () => {
      relayed.push(name);
    });
  }
  return { relay, events, relayed, states };
}

describe('SessionRelay', () => {
  it("cuts a change's events short when a listener changes the state again", async () => {
    const session = idleSession();
    const { events, relayed, states } = relaying(session);
    events.on('play', () => {
      session.pause();
    });
    await session.play();
    expect(relayed).toEqual(['play', 'pause']);
    expect(states).toEqual(['paused']);
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
});
