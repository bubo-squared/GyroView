import { GyroViewError } from '@gyroview/core';
import type { GyroViewElement } from '@gyroview/player';

import { COMMAND_HANDLERS } from './commandHandlers';
import type { Endpoint } from './Endpoint';
import {
  eventMessage,
  failedResult,
  helloMessage,
  okResult,
  type CommandMessage,
  type ProtocolMessage,
  type SerializedError,
} from '../protocol/messages';

/**
 * The element events forwarded to the embedding page, with their payloads made cloneable.
 */
const FORWARDED_EVENTS = [
  'statuschange',
  'ready',
  'play',
  'playing',
  'waiting',
  'pause',
  'ended',
  'timeupdate',
  'seeking',
  'seeked',
  'viewchange',
  'viewmodechange',
  'stabilizationchange',
  'volumechange',
  'warning',
  'error',
] as const;

/**
 * The iframe side of the bridge: runs the commands the embedding page sends on the element
 * and forwards the element's events. Says hello once listening, so a page that embedded the
 * frame before it loaded knows when to start talking.
 */
export class EmbedHost {
  private readonly stopReceiving: () => void;
  private readonly listeners: (readonly [string, EventListener])[] = [];

  public constructor(
    private readonly element: GyroViewElement,
    private readonly endpoint: Endpoint,
  ) {
    this.stopReceiving = endpoint.receive((message) => {
      this.onMessage(message);
    });
    for (const name of FORWARDED_EVENTS) this.forward(name);
    endpoint.send(helloMessage());
  }

  public dispose(): void {
    this.stopReceiving();
    for (const [name, listener] of this.listeners) this.element.removeEventListener(name, listener);
  }

  private forward(name: string): void {
    const listener: EventListener = (event): void => {
      const detail = event instanceof CustomEvent ? (event.detail as unknown) : undefined;
      this.endpoint.send(eventMessage(name, serializeDetail(detail)));
    };
    this.element.addEventListener(name, listener);
    this.listeners.push([name, listener]);
  }

  private onMessage(message: ProtocolMessage): void {
    if (message.kind === 'command') void this.run(message);
  }

  private async run(command: CommandMessage): Promise<void> {
    try {
      const value = await COMMAND_HANDLERS[command.name](this.element, command.parameters);
      this.endpoint.send(okResult(command.id, value));
    } catch (error) {
      this.endpoint.send(failedResult(command.id, serializeError(error)));
    }
  }
}

/**
 * Errors keep their code and message; everything else the player emits is plain data.
 */
function serializeDetail(detail: unknown): unknown {
  return detail instanceof Error ? serializeError(detail) : detail;
}

function serializeError(error: unknown): SerializedError {
  return error instanceof GyroViewError
    ? { code: error.code, message: error.message }
    : {
        code: 'invariant-violation',
        message: error instanceof Error ? error.message : String(error),
      };
}
