import { keysOf } from '@gyroview/core';
import type { PlayerEvents } from '@gyroview/player';

/**
 * The wire format between an embedding page and the `embed.html` iframe. Versioned by name so
 * a page and a player built apart can tell each other apart from unrelated messages.
 */
export const PROTOCOL = 'gyro-view/1';

const COMMAND_NAMES = [
  'play',
  'pause',
  'stop',
  'seek',
  'scrub',
  'lookAt',
  'resetView',
  'zoom',
  'setStabilization',
  'setViewMode',
  'setQuality',
  'setVolume',
  'setMuted',
  'setLoop',
  'load',
  'getState',
] as const;

export type CommandName = (typeof COMMAND_NAMES)[number];

/**
 * The frame is listening; `state` is the player's state at that moment, which the page's mirror
 * starts from, and the events after it keep current. A frame built before the state was added
 * says hello without it.
 */
export interface HelloMessage {
  readonly protocol: typeof PROTOCOL;
  readonly kind: 'hello';
  readonly state?: unknown;
}

export interface CommandMessage {
  readonly protocol: typeof PROTOCOL;
  readonly kind: 'command';
  /**
   * Unique among the commands one page sends one frame document.
   */
  readonly id: number;
  /**
   * A `CommandName`, or a name only a later build knows: a page may embed a frame served from an
   * earlier one, which answers it as a command it cannot run.
   */
  readonly name: string;
  readonly parameters: readonly unknown[];
  /**
   * The oldest command the page still waits on, this one included: the frame forgets the ids
   * below it, which cannot be asked again. A page of an earlier build sends none.
   */
  readonly oldestUnanswered?: number;
}

export interface SerializedError {
  readonly code: string;
  readonly message: string;
}

export type ResultMessage = {
  readonly protocol: typeof PROTOCOL;
  readonly kind: 'result';
  readonly id: number;
} & (
  | { readonly isOk: true; readonly value: unknown }
  | { readonly isOk: false; readonly error: SerializedError }
);

/**
 * `frame` fires for every drawn frame: too chatty to cross `postMessage`, and `timeupdate`
 * already tells the page the time.
 */
type NotForwarded = 'frame';

export type ForwardedEventName = Exclude<keyof PlayerEvents, NotForwarded>;

/**
 * Every forwarded event once, typed by the player's events alone so the snippet carries no player
 * code; the record makes the compiler reject a missing or unknown name.
 */
const FORWARDED: Readonly<Record<ForwardedEventName, true>> = {
  statuschange: true,
  ready: true,
  play: true,
  playing: true,
  waiting: true,
  pause: true,
  ended: true,
  timeupdate: true,
  seeking: true,
  seeked: true,
  viewchange: true,
  viewmodechange: true,
  motionlookchange: true,
  stabilizationchange: true,
  qualitychange: true,
  volumechange: true,
  warning: true,
  error: true,
};

export const FORWARDED_EVENT_NAMES = keysOf(FORWARDED);

/**
 * Events as the embedding page hears them: the player's, the error rebuilt from the code and
 * message that cross the channel, with its category.
 */
export type EmbedEvents = Pick<PlayerEvents, ForwardedEventName>;

export interface EventMessage {
  readonly protocol: typeof PROTOCOL;
  readonly kind: 'event';
  readonly name: ForwardedEventName;
  readonly detail: unknown;
}

export type ProtocolMessage = HelloMessage | CommandMessage | ResultMessage | EventMessage;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isCommandName(value: unknown): value is CommandName {
  return typeof value === 'string' && (COMMAND_NAMES as readonly string[]).includes(value);
}

function isOptionalNumber(value: unknown): boolean {
  return value === undefined || typeof value === 'number';
}

function isForwardedEventName(value: unknown): value is ForwardedEventName {
  return typeof value === 'string' && Object.hasOwn(FORWARDED, value);
}

function isSerializedError(value: unknown): value is SerializedError {
  return (
    isRecord(value) && typeof value['code'] === 'string' && typeof value['message'] === 'string'
  );
}

function isResultBody(message: Record<string, unknown>): boolean {
  if (typeof message['id'] !== 'number') return false;
  return message['isOk'] === true
    ? 'value' in message
    : message['isOk'] === false && isSerializedError(message['error']);
}

type BodyCheck = (message: Record<string, unknown>) => boolean;

/**
 * A map, not an object: a `kind` of `constructor` or `__proto__` must find nothing.
 */
const BODY_CHECKS: ReadonlyMap<string, BodyCheck> = new Map<string, BodyCheck>([
  ['hello', (message): boolean => message['state'] === undefined || isRecord(message['state'])],
  [
    'command',
    (message): boolean =>
      typeof message['id'] === 'number' &&
      typeof message['name'] === 'string' &&
      Array.isArray(message['parameters']) &&
      isOptionalNumber(message['oldestUnanswered']),
  ],
  ['result', isResultBody],
  ['event', (message): boolean => isForwardedEventName(message['name']) && 'detail' in message],
]);

/**
 * Whether unknown data from `postMessage` is one of ours, well-formed. Anything else on the
 * window (extensions, analytics, other widgets) is ignored.
 */
export function isProtocolMessage(data: unknown): data is ProtocolMessage {
  if (!isRecord(data) || data['protocol'] !== PROTOCOL) return false;
  const check = typeof data['kind'] === 'string' ? BODY_CHECKS.get(data['kind']) : undefined;
  return check?.(data) ?? false;
}

export function helloMessage(state: unknown): HelloMessage {
  return { protocol: PROTOCOL, kind: 'hello', state };
}

export function commandMessage(
  id: number,
  name: CommandName,
  parameters: readonly unknown[],
): CommandMessage {
  return { protocol: PROTOCOL, kind: 'command', id, name, parameters };
}

export function okResult(id: number, value: unknown): ResultMessage {
  return { protocol: PROTOCOL, kind: 'result', id, isOk: true, value };
}

export function failedResult(id: number, error: SerializedError): ResultMessage {
  return { protocol: PROTOCOL, kind: 'result', id, isOk: false, error };
}

export function eventMessage(name: ForwardedEventName, detail: unknown): EventMessage {
  return { protocol: PROTOCOL, kind: 'event', name, detail };
}
