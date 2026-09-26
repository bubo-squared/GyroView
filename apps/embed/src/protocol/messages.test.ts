import { describe, expect, it } from 'vitest';

import {
  commandMessage,
  eventMessage,
  failedResult,
  helloMessage,
  isProtocolMessage,
  okResult,
  PROTOCOL,
} from './messages';

describe('isProtocolMessage', () => {
  it('accepts every message the factories build', () => {
    for (const message of [
      helloMessage({ status: 'idle' }),
      commandMessage(1, 'seek', [12]),
      okResult(1, undefined),
      failedResult(2, { code: 'decode', message: 'no' }),
      eventMessage('timeupdate', 3.5),
    ]) {
      expect(isProtocolMessage(message)).toBe(true);
    }
  });

  it('rejects data that is not ours or is malformed', () => {
    expect(isProtocolMessage(undefined)).toBe(false);
    expect(isProtocolMessage('gyro-view/1')).toBe(false);
    expect(isProtocolMessage({ protocol: 'other/1', kind: 'hello', state: {} })).toBe(false);
    expect(isProtocolMessage({ protocol: PROTOCOL, kind: 'hello' })).toBe(false);
    expect(isProtocolMessage({ protocol: PROTOCOL, kind: 'dance' })).toBe(false);
    for (const kind of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
      expect(isProtocolMessage({ protocol: PROTOCOL, kind })).toBe(false);
    }
    expect(
      isProtocolMessage({ protocol: PROTOCOL, kind: 'command', id: 1, name: 'rm', parameters: [] }),
    ).toBe(false);
    expect(
      isProtocolMessage({
        protocol: PROTOCOL,
        kind: 'command',
        id: '1',
        name: 'play',
        parameters: [],
      }),
    ).toBe(false);
    expect(isProtocolMessage({ protocol: PROTOCOL, kind: 'command', id: 1, name: 'play' })).toBe(
      false,
    );
    expect(
      isProtocolMessage({ protocol: PROTOCOL, kind: 'result', id: 1, isOk: false, error: {} }),
    ).toBe(false);
    expect(isProtocolMessage({ protocol: PROTOCOL, kind: 'result', id: 1, isOk: true })).toBe(
      false,
    );
    expect(isProtocolMessage({ protocol: PROTOCOL, kind: 'event', name: 'x' })).toBe(false);
  });
});
