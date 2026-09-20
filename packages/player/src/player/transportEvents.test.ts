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

  it('brackets a seek without repeating play or pause, adding waiting when it resumes', () => {
    expect(transportEventsFor('playing', 'seeking')).toEqual(['seeking']);
    expect(transportEventsFor('buffering', 'seeking')).toEqual(['seeking']);
    expect(transportEventsFor('seeking', 'buffering')).toEqual(['seeked', 'waiting']);
    expect(transportEventsFor('seeking', 'paused')).toEqual(['seeked']);
  });

  it('says nothing for states that are not transport changes', () => {
    expect(transportEventsFor('playing', 'ended')).toEqual([]);
    expect(transportEventsFor('paused', 'error')).toEqual([]);
    expect(transportEventsFor(undefined, 'ready')).toEqual([]);
    expect(transportEventsFor('ready', 'paused')).toEqual([]);
  });
});
