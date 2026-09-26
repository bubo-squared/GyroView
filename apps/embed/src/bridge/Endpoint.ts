import { isProtocolMessage, type ProtocolMessage } from '../protocol/messages';
import { isTrustedOrigin } from '../protocol/origins';

/**
 * One side of a message channel carrying protocol messages: `postMessage` between windows in
 * production, a `MessagePort` in tests.
 */
export interface Endpoint {
  send(message: ProtocolMessage): void;
  /**
   * Delivers well-formed protocol messages from trusted senders; returns the unsubscribe.
   */
  receive(handler: (message: ProtocolMessage) => void): () => void;
}

export interface WindowEndpointParts {
  /**
   * Where messages go and which origin may read them.
   */
  readonly target: Window;
  readonly targetOrigin: string;
  /**
   * The window whose `message` events are read, and which origins (and which sender window,
   * when given) are believed.
   */
  readonly listenOn: Window;
  readonly allowedOrigins: readonly string[];
  readonly expectedSource?: Window;
}

export function windowEndpoint(parts: WindowEndpointParts): Endpoint {
  return {
    send: (message): void => {
      parts.target.postMessage(message, parts.targetOrigin);
    },
    receive: (handler): (() => void) => {
      const listener = (event: MessageEvent<unknown>): void => {
        const isFromStranger =
          parts.expectedSource !== undefined && event.source !== parts.expectedSource;
        if (isFromStranger || !isTrustedOrigin(event.origin, parts.allowedOrigins)) return;
        if (isProtocolMessage(event.data)) handler(event.data);
      };
      parts.listenOn.addEventListener('message', listener);
      return (): void => {
        parts.listenOn.removeEventListener('message', listener);
      };
    },
  };
}

/**
 * Both ends in one document over a `MessageChannel`: how the bridge tests drive a host and a
 * handle together.
 */
export function portEndpoint(port: MessagePort): Endpoint {
  return {
    send: (message): void => {
      port.postMessage(message);
    },
    receive: (handler): (() => void) => {
      const listener = (event: MessageEvent<unknown>): void => {
        if (isProtocolMessage(event.data)) handler(event.data);
      };
      port.addEventListener('message', listener);
      port.start();
      return (): void => {
        port.removeEventListener('message', listener);
      };
    },
  };
}
