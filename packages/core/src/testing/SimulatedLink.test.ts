import { describe, expect, it } from 'vitest';

import { describeByteStreamContract } from './ByteStream.contract';
import { SimulatedLink } from './SimulatedLink';
import type { ByteStream } from '../ports/ByteStream';
import { ByteRange } from '../shared/binary/ByteRange';
import { settle } from '../../test/support/settle';

const FILE = Uint8Array.from({ length: 1000 }, (_, index) => index % 251);

/**
 * The link advanced a tick for every chunk asked for, so an iteration runs to its end alone.
 */
function advancingByItself(link: SimulatedLink): ByteStream {
  return {
    stream: (range): AsyncIterable<Uint8Array> => {
      const chunks = link.stream(range)[Symbol.asyncIterator]();
      return {
        [Symbol.asyncIterator]: (): AsyncIterator<Uint8Array> => ({
          next: (): Promise<IteratorResult<Uint8Array>> => {
            const next = chunks.next();
            link.advance();
            return next;
          },
          return: (): Promise<IteratorResult<Uint8Array>> =>
            chunks.return?.() ?? Promise.resolve({ done: true, value: undefined }),
        }),
      };
    },
  };
}

describeByteStreamContract('simulated link', (bytes) =>
  Promise.resolve(
    advancingByItself(new SimulatedLink(bytes, { bytesPerTick: 10, latencyTicks: 0 })),
  ),
);

describe('SimulatedLink', () => {
  it("delivers nothing before a request's latency has passed", async () => {
    const link = new SimulatedLink(FILE, { bytesPerTick: 100, latencyTicks: 3 });
    const chunks = link.stream(ByteRange.of(0, 500))[Symbol.asyncIterator]();
    const first = chunks.next();
    link.advance(2);
    await settle();
    expect(link.requests[0]?.deliveredBytes).toBe(0);
    link.advance(1);
    await expect(first).resolves.toMatchObject({ done: false });
    expect(link.requests[0]?.deliveredBytes).toBe(100);
  });

  it('shares its bandwidth evenly among the requests streaming', () => {
    const link = new SimulatedLink(FILE, { bytesPerTick: 100, latencyTicks: 0 });
    for (const range of [ByteRange.of(0, 400), ByteRange.of(500, 400)]) {
      link.stream(range)[Symbol.asyncIterator]();
    }
    link.advance(2);
    expect(link.requests.map((request) => request.deliveredBytes)).toEqual([100, 100]);
  });

  it('carries no request faster than a server that paces each answer sends it', () => {
    const link = new SimulatedLink(FILE, {
      bytesPerTick: 100,
      latencyTicks: 0,
      bytesPerTickPerRequest: 30,
    });
    for (const range of [ByteRange.of(0, 200), ByteRange.of(200, 200)]) {
      link.stream(range)[Symbol.asyncIterator]();
    }

    link.advance();

    expect(link.requests.map((request) => request.deliveredBytes)).toEqual([30, 30]);
  });

  it('logs a request given up midway, and carries no more of it', () => {
    const link = new SimulatedLink(FILE, { bytesPerTick: 100, latencyTicks: 0 });
    const chunks = link.stream(ByteRange.of(0, 500))[Symbol.asyncIterator]();
    link.advance(2);
    void chunks.return?.();
    link.advance(3);
    expect(link.requests[0]).toMatchObject({ deliveredBytes: 200, wasGivenUp: true, endedAt: 2 });
    expect(link.deliveredBytes).toBe(200);
  });

  it('fails the requests it was told to', async () => {
    const link = new SimulatedLink(FILE, { bytesPerTick: 100, latencyTicks: 0 });
    link.failWhere((range) => range.offset >= 500, new Error('the connection dropped'));
    const failing = link.stream(ByteRange.of(600, 100))[Symbol.asyncIterator]().next();
    link.advance();
    await expect(failing).rejects.toThrow('the connection dropped');
    expect(link.requests[0]).toMatchObject({ hasFailed: true, deliveredBytes: 0 });
  });
});
