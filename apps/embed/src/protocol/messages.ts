/**
 * The wire format between an embedding page and the `embed.html` iframe. Versioned by name so
 * a page and a player built apart can tell each other apart from unrelated messages.
 */
export const PROTOCOL = 'gyro-view/1';

export const COMMAND_NAMES = [
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
  'setVolume',
  'setMuted',
  'setLoop',
  'load',
  'getState',
] as const;

export type CommandName = (typeof COMMAND_NAMES)[number];

export interface HelloMessage {
  readonly protocol: typeof PROTOCOL;
  readonly kind: 'hello';
}

export interface CommandMessage {
  readonly protocol: typeof PROTOCOL;
  readonly kind: 'command';
  readonly id: number;
  readonly name: CommandName;
  readonly parameters: readonly unknown[];
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

export interface EventMessage {
  readonly protocol: typeof PROTOCOL;
  readonly kind: 'event';
  readonly name: string;
  readonly detail: unknown;
}

export type ProtocolMessage = HelloMessage | CommandMessage | ResultMessage | EventMessage;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isCommandName(value: unknown): value is CommandName {
  return typeof value === 'string' && (COMMAND_NAMES as readonly string[]).includes(value);
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

const BODY_CHECKS: Readonly<Record<string, (message: Record<string, unknown>) => boolean>> = {
  hello: (): boolean => true,
  command: (message): boolean =>
    typeof message['id'] === 'number' &&
    isCommandName(message['name']) &&
    Array.isArray(message['parameters']),
  result: isResultBody,
  event: (message): boolean => typeof message['name'] === 'string' && 'detail' in message,
};

/**
 * Whether unknown data from `postMessage` is one of ours, well-formed. Anything else on the
 * window (extensions, analytics, other widgets) is ignored.
 */
export function isProtocolMessage(data: unknown): data is ProtocolMessage {
  if (!isRecord(data) || data['protocol'] !== PROTOCOL) return false;
  const check = typeof data['kind'] === 'string' ? BODY_CHECKS[data['kind']] : undefined;
  return check?.(data) ?? false;
}

export function helloMessage(): HelloMessage {
  return { protocol: PROTOCOL, kind: 'hello' };
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

export function eventMessage(name: string, detail: unknown): EventMessage {
  return { protocol: PROTOCOL, kind: 'event', name, detail };
}
