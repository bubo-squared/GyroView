import { describe, expect, it } from 'vitest';

import { transportEventsFor } from './transportEvents';

describe('transportEventsFor', () => {
  it('announces play with playing or waiting when playback is asked for', () => {
    expect(transportEventsFor('ready', 'playing')).toEqual(['play', 'playing']);
    expect(transportEventsFor('ready', 'buffering')).toEqual(['play', 'waiting']);
    expect(transportEventsFor('paused', 'buffering')).toEqual(['play', 'waiting']);
    expect(transportEventsFor('ended', 'buffering')).toEqual(['play', 'waiting']);
  });

  it('reports holds and their end while playing', () => {
    expect(transportEventsFor('playing', 'buffering')).toEqual(['waiting']);
    expect(transportEventsFor('buffering', 'playing')).toEqual(['playing']);
    expect(transportEventsFor('buffering', 'paused')).toEqual(['pause']);
    expect(transportEventsFor('playing', 'paused')).toEqual(['pause']);
  });

  it('begins a seek without repeating play or pause, adding waiting when it resumes', () => {
    expect(transportEventsFor('playing', 'seeking')).toEqual(['seeking']);
    expect(transportEventsFor('buffering', 'seeking')).toEqual(['seeking']);
    expect(transportEventsFor('seeking', 'buffering')).toEqual(['waiting']);
    expect(transportEventsFor('seeking', 'paused')).toEqual([]);
  });

  it('pauses at the end, as a media element does before its ended', () => {
    expect(transportEventsFor('playing', 'ended')).toEqual(['pause']);
  });

  it('says nothing for states that are not transport changes', () => {
    expect(transportEventsFor('paused', 'error')).toEqual([]);
    expect(transportEventsFor(undefined, 'ready')).toEqual([]);
    expect(transportEventsFor('ready', 'paused')).toEqual([]);
  });
});
