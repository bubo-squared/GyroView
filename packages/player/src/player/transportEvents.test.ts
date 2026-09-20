import { describe, expect, it } from 'vitest';

import { transportEventsFor } from './transportEvents';

describe('transportEventsFor', () => {
  it('announces play and pause on plain transitions', () => {
    expect(transportEventsFor('ready', 'playing')).toEqual(['play']);
    expect(transportEventsFor('playing', 'paused')).toEqual(['pause']);
    expect(transportEventsFor('ended', 'playing')).toEqual(['play']);
  });

  it('brackets a seek without repeating play or pause', () => {
    expect(transportEventsFor('playing', 'seeking')).toEqual(['seeking']);
    expect(transportEventsFor('seeking', 'playing')).toEqual(['seeked']);
    expect(transportEventsFor('seeking', 'paused')).toEqual(['seeked']);
  });

  it('says nothing for states that are not transport changes', () => {
    expect(transportEventsFor('playing', 'ended')).toEqual([]);
    expect(transportEventsFor('paused', 'error')).toEqual([]);
    expect(transportEventsFor(undefined, 'ready')).toEqual([]);
  });
});
