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
   * The one window at the other end, and its origin: messages go only there, and only messages
   * from that window at that origin are believed (ADR 0010). Looked up at each use: an iframe
   * moved within its page loads anew in a window of its own.
   */
  readonly peer: () => Window | null;
  readonly peerOrigin: string;
  /**
   * The window whose `message` events are read.
   */
  readonly listenOn: Window;
}

export function windowEndpoint(parts: WindowEndpointParts): Endpoint {
  return {
    send: (message): void => {
      parts.peer()?.postMessage(message, parts.peerOrigin);
    },
    receive: (handler): (() => void) => {
      const listener = (event: MessageEvent<unknown>): void => {
        const peer = parts.peer();
        const isFromPeer =
          peer !== null && event.source === peer && isTrustedOrigin(event.origin, parts.peerOrigin);
        if (isFromPeer && isProtocolMessage(event.data)) handler(event.data);
      };
      parts.listenOn.addEventListener('message', listener);
      return (): void => {
        parts.listenOn.removeEventListener('message', listener);
      };
    },
  };
}
