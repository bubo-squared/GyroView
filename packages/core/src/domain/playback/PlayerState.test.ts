import { describe, expect, it } from 'vitest';

import { PlayerStateMachine, type PlayerState } from './PlayerState';
import { captureError } from '../../../test/support/errors';

/**
 * A legal way into each state from `ready`.
 */
const PATHS: Readonly<Record<PlayerState, readonly PlayerState[]>> = {
  ready: [],
  playing: ['playing'],
  buffering: ['buffering'],
  paused: ['paused'],
  seeking: ['seeking'],
  ended: ['playing', 'ended'],
  error: ['error'],
  disposed: ['disposed'],
};

const ALL_STATES = Object.keys(PATHS) as PlayerState[];

function machineIn(state: PlayerState): PlayerStateMachine {
  const machine = new PlayerStateMachine();
  const path = PATHS[state];
  for (const next of path) machine.transitionTo(next);
  return machine;
}

const EXPECTED_TRANSITIONS: Readonly<Record<PlayerState, readonly PlayerState[]>> = {
  ready: ['playing', 'buffering', 'paused', 'seeking', 'error', 'disposed'],
  playing: ['buffering', 'paused', 'seeking', 'ended', 'error', 'disposed'],
  buffering: ['playing', 'paused', 'seeking', 'error', 'disposed'],
  paused: ['playing', 'buffering', 'seeking', 'error', 'disposed'],
  seeking: ['buffering', 'paused', 'error', 'disposed'],
  ended: ['seeking', 'error', 'disposed'],
  error: ['disposed'],
  disposed: [],
};

describe('PlayerStateMachine', () => {
  it('starts ready and walks the happy path', () => {
    const machine = new PlayerStateMachine();
    expect(machine.state).toBe('ready');
    for (const next of [
      'buffering',
      'playing',
      'paused',
      'seeking',
      'buffering',
      'playing',
      'ended',
      'seeking',
    ] as const) {
      machine.transitionTo(next);
      expect(machine.state).toBe(next);
    }
  });

  it('allows exactly the documented transitions from every state', () => {
    const table = Object.entries(EXPECTED_TRANSITIONS) as [PlayerState, readonly PlayerState[]][];
    for (const [state, allowed] of table) {
      const machine = machineIn(state);
      const permitted = ALL_STATES.filter((next) => machine.canTransitionTo(next));
      expect(permitted, state).toEqual(allowed);
    }
  });

  it('rejects illegal transitions with a typed error and keeps its state', () => {
    const machine = new PlayerStateMachine();
    expect(
      captureError(() => {
        machine.transitionTo('ended');
      }),
    ).toMatchObject({
      code: 'invariant-violation',
      message: 'player cannot go from ready to ended',
    });
    expect(machine.state).toBe('ready');
  });

  it('treats disposed as terminal and error as leading only to disposed', () => {
    const machine = new PlayerStateMachine();
    machine.transitionTo('error');
    expect(machine.canTransitionTo('playing')).toBe(false);
    machine.transitionTo('disposed');
    expect(machine.canTransitionTo('ready')).toBe(false);
    expect(machine.isOneOf('disposed', 'error')).toBe(true);
    expect(machine.isOneOf('ready', 'playing')).toBe(false);
  });
});
