import type { PlayerState } from '@gyroview/core';

export type TransportEventName = 'seeking' | 'play' | 'playing' | 'waiting' | 'pause';

const STOPPED_STATES: ReadonlySet<PlayerState> = new Set<PlayerState>(['ready', 'paused', 'ended']);

/**
 * What flowing states announce: frames flow, or playback holds for them.
 */
const FLOW_EVENTS: ReadonlyMap<PlayerState, TransportEventName> = new Map<
  PlayerState,
  TransportEventName
>([
  ['playing', 'playing'],
  ['buffering', 'waiting'],
]);

/**
 * The transport events a session state change means to a listener who thinks in media-element
 * terms: `play` when playback is asked for, `waiting` while it holds for frames, `playing` when
 * frames flow, `pause` when it stops, at the end too, and `seeking` when a seek begins, without
 * repeating `play` or `pause`. `seeked` is the session's own: a seek is done once its first
 * picture is drawn (ADR 0042).
 */
export function transportEventsFor(
  previous: PlayerState | undefined,
  next: PlayerState,
): readonly TransportEventName[] {
  if (next === 'seeking') return ['seeking'];
  if (previous === 'seeking') return next === 'buffering' ? ['waiting'] : [];
  if (next === 'paused') return previous === 'ready' ? [] : ['pause'];
  return next === 'ended' ? ['pause'] : flowEventsFor(previous, next);
}

function flowEventsFor(
  previous: PlayerState | undefined,
  next: PlayerState,
): readonly TransportEventName[] {
  const flow = FLOW_EVENTS.get(next);
  if (flow === undefined) return [];
  const isStarting = previous === undefined || STOPPED_STATES.has(previous);
  return isStarting ? ['play', flow] : [flow];
}
