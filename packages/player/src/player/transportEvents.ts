import type { PlayerState } from '@gyroview/core';

export type TransportEventName = 'seeking' | 'seeked' | 'play' | 'pause';

/**
 * The transport events a session state change means to a listener who thinks in media-element
 * terms: a seek is bracketed by `seeking` and `seeked`, and resuming after it is not a new
 * `play`, nor is landing paused after it a new `pause`.
 */
export function transportEventsFor(
  previous: PlayerState | undefined,
  next: PlayerState,
): readonly TransportEventName[] {
  if (next === 'seeking') return ['seeking'];
  const events: TransportEventName[] = previous === 'seeking' ? ['seeked'] : [];
  if (previous !== 'seeking' && next === 'playing') events.push('play');
  if (previous !== 'seeking' && next === 'paused') events.push('pause');
  return events;
}
