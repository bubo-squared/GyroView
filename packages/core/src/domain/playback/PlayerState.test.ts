import { describe, expect, it } from 'vitest';

import { PlayerStateMachine } from './PlayerState';
import { captureError } from '../../../test/support/errors';

describe('PlayerStateMachine', () => {
  it('starts idle and walks the happy path', () => {
    const machine = new PlayerStateMachine();
    expect(machine.state).toBe('idle');
    for (const next of [
      'ready',
      'playing',
      'paused',
      'seeking',
      'playing',
      'ended',
      'playing',
    ] as const) {
      machine.transitionTo(next);
      expect(machine.state).toBe(next);
    }
  });

  it('rejects illegal transitions with a typed error and keeps its state', () => {
    const machine = new PlayerStateMachine();
    expect(
      captureError(() => {
        machine.transitionTo('playing');
      }),
    ).toMatchObject({ code: 'invariant-violation' });
    expect(machine.state).toBe('idle');
  });

  it('treats disposed as terminal and error as leading only to disposed', () => {
    const machine = new PlayerStateMachine();
    machine.transitionTo('ready');
    machine.transitionTo('error');
    expect(machine.canTransitionTo('playing')).toBe(false);
    machine.transitionTo('disposed');
    expect(machine.canTransitionTo('ready')).toBe(false);
    expect(machine.isOneOf('disposed', 'error')).toBe(true);
  });
});
