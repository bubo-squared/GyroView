import type { Endpoint } from '../bridge/Endpoint';
import { isProtocolMessage } from '../protocol/messages';

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
