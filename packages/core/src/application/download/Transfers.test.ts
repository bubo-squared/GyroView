import { describe, expect, it } from 'vitest';

import { BlockStore } from './BlockStore';
import { Transfers, type TransferListener } from './Transfers';
import type { ByteStream } from '../../ports/ByteStream';
import { ByteRange } from '../../shared/binary/ByteRange';
import { ByteRangeSet } from '../../shared/binary/ByteRangeSet';
import { SimulatedLink } from '../../testing/SimulatedLink';
import { settle } from '../../../test/support/settle';

const FILE = Uint8Array.from({ length: 1000 }, (_, index) => index % 256);

interface Heard {
  chunks: number;
  ends: number;
  failures: { range: ByteRange; error: unknown }[];
}

function listening(): { heard: Heard; listener: TransferListener } {
  const heard: Heard = { chunks: 0, ends: 0, failures: [] };
  return {
    heard,
    listener: {
      onChunk: (): void => {
        heard.chunks += 1;
      },
      onEnd: (): void => {
        heard.ends += 1;
      },
      onFailure: (range, error): void => {
        heard.failures.push({ range, error });
      },
    },
  };
}

/**
 * A stream that hands out the first `byteCount` bytes of each range, then fails.
 */
function breakingStream(byteCount: number, error: Error): ByteStream {
  return {
    stream: (range): AsyncIterable<Uint8Array> => ({
      async *[Symbol.asyncIterator](): AsyncGenerator<Uint8Array> {
        yield FILE.slice(range.offset, range.offset + byteCount);
        await Promise.resolve();
        throw error;
      },
    }),
  };
}

/**
 * A stream whose every read fails, and whose reads cannot be given up.
 */
function failingStream(error: Error): ByteStream {
  return {
    stream: (): AsyncIterable<Uint8Array> => ({
      [Symbol.asyncIterator]: (): AsyncIterator<Uint8Array> => ({
        next: (): Promise<IteratorResult<Uint8Array>> => Promise.reject(error),
      }),
    }),
  };
}

function setup(): { link: SimulatedLink; store: BlockStore; transfers: Transfers; heard: Heard } {
  const link = new SimulatedLink(FILE, { bytesPerTick: 100, latencyTicks: 0 });
  const store = new BlockStore();
  const { heard, listener } = listening();
  return { link, store, heard, transfers: new Transfers({ stream: link, store, listener }) };
}

describe('Transfers', () => {
  it('streams a range into its block, telling of every chunk and of its end', async () => {
    const { link, store, transfers, heard } = setup();
    transfers.start(ByteRange.of(200, 300));
    for (let tick = 0; tick < 3; tick += 1) {
      link.advance();
      await settle();
    }
    expect(heard).toMatchObject({ chunks: 3, ends: 1 });
    expect([...(store.bytesOf(ByteRange.of(200, 300)) ?? [])]).toEqual([
      ...FILE.subarray(200, 500),
    ]);
    expect(transfers.states).toEqual([]);
    store.release(ByteRangeSet.of([ByteRange.of(200, 300)]));
    expect(store.allocatedBytes).toBe(0);
  });

  it('tells what of each range is still to come', async () => {
    const { link, transfers } = setup();
    transfers.start(ByteRange.of(0, 300));
    link.advance();
    await settle();
    expect(transfers.states.map((state) => [state.remaining.offset, state.remaining.end])).toEqual([
      [100, 300],
    ]);
  });

  it('brings a range within one it streams, partly come or not, until it ends or is given up', async () => {
    const { link, transfers } = setup();
    transfers.start(ByteRange.of(0, 300));
    link.advance();
    await settle();
    expect(transfers.isBringing(ByteRange.of(50, 100))).toBe(true);
    expect(transfers.isBringing(ByteRange.of(250, 100))).toBe(false);
    transfers.cancel(transfers.states[0]?.id ?? -1);
    expect(transfers.isBringing(ByteRange.of(50, 100))).toBe(false);
  });

  it('gives a range up at once, keeping what came', async () => {
    const { link, store, transfers, heard } = setup();
    transfers.start(ByteRange.of(0, 500));
    link.advance();
    await settle();
    const [transfer] = transfers.states;
    transfers.cancel(transfer?.id ?? -1);
    link.advance(4);
    await settle();
    expect(link.requests[0]).toMatchObject({ wasGivenUp: true, deliveredBytes: 100 });
    expect(store.held.ranges.map((range) => [range.offset, range.end])).toEqual([[0, 100]]);
    expect(store.allocatedBytes).toBe(100);
    expect(heard).toMatchObject({ chunks: 1, ends: 0 });
    expect(transfers.states).toEqual([]);
  });

  it('tells of a range that failed, with its error, keeping what came', async () => {
    const { link, store, transfers, heard } = setup();
    const error = new Error('the connection dropped');
    link.failWhere((range) => range.offset === 600, error);
    transfers.start(ByteRange.of(600, 100));
    link.advance();
    await settle();
    expect(heard.failures).toEqual([{ range: ByteRange.of(600, 100), error }]);
    expect(store.allocatedBytes).toBe(0);
    expect(transfers.states).toEqual([]);
  });

  it('tells, of a range that broke off, only what had not come', async () => {
    const store = new BlockStore();
    const { heard, listener } = listening();
    const error = new Error('the connection dropped');
    const transfers = new Transfers({ stream: breakingStream(40, error), store, listener });
    transfers.start(ByteRange.of(100, 100));
    await settle();
    expect(heard.failures).toEqual([{ range: ByteRange.of(140, 60), error }]);
    expect(store.bytesOf(ByteRange.of(100, 40))).toEqual(FILE.subarray(100, 140));
  });

  it('tells nothing of a range given up whose stream fails after, nor minds a stream it cannot stop', async () => {
    const store = new BlockStore();
    const { heard, listener } = listening();
    const stream = failingStream(new Error('the connection dropped'));
    const transfers = new Transfers({ stream, store, listener });
    transfers.start(ByteRange.of(0, 100));
    const [transfer] = transfers.states;
    transfers.cancel(transfer?.id ?? -1);
    await settle();
    expect(heard.failures).toEqual([]);
  });

  it('minds no range given up twice, nor one it never started', async () => {
    const { transfers } = setup();
    transfers.start(ByteRange.of(0, 100));
    const [transfer] = transfers.states;
    transfers.cancel(transfer?.id ?? -1);
    transfers.cancel(transfer?.id ?? -1);
    transfers.cancel(99);
    await settle();
    expect(transfers.states).toEqual([]);
  });

  it('gives every range up at once', async () => {
    const { link, transfers } = setup();
    transfers.start(ByteRange.of(0, 400));
    transfers.start(ByteRange.of(500, 400));
    await settle();
    transfers.cancelAll();
    expect(link.requests.map((request) => request.wasGivenUp)).toEqual([true, true]);
  });
});
