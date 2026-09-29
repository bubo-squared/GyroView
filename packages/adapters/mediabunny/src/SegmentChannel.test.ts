import { describe, expect, it } from 'vitest';

import { SegmentChannel } from './SegmentChannel';

const bytes = (value: number): Uint8Array<ArrayBuffer> => new Uint8Array([value]);

async function collect(channel: SegmentChannel): Promise<number[]> {
  const seen: number[] = [];
  for await (const segment of channel.segments()) seen.push(segment[0] ?? -1);
  return seen;
}

describe('SegmentChannel', () => {
  it('delivers segments in order and ends the iteration when closed', async () => {
    const channel = new SegmentChannel(2);
    const consumer = collect(channel);
    channel.push(bytes(1));
    channel.push(bytes(2));
    await Promise.resolve();
    channel.push(bytes(3));
    channel.close();
    await expect(consumer).resolves.toEqual([1, 2, 3]);
  });

  it('holds the producer once the capacity is reached until the consumer takes', async () => {
    const channel = new SegmentChannel(1);
    channel.push(bytes(1));
    let hasRoom = false;
    const room = (async (): Promise<void> => {
      await channel.waitForRoom();
      hasRoom = true;
    })();
    await Promise.resolve();
    expect(hasRoom).toBe(false);
    const iterator = channel.segments();
    await iterator.next();
    await room;
    expect(hasRoom).toBe(true);
    channel.close();
    await iterator.return();
  });

  it('ends at once when the consumer returns while it awaits a segment, and closes the channel', async () => {
    const channel = new SegmentChannel(2);
    let releases = 0;
    const segments = channel.segments(() => {
      releases += 1;
    });
    const awaited = segments.next();
    await expect(segments.return()).resolves.toMatchObject({ done: true });
    await expect(awaited).resolves.toMatchObject({ done: true });
    expect(channel.isClosed).toBe(true);
    await segments.next();
    expect(releases).toBe(1);
  });

  it('tells its consumer once it ends by itself, drained after the producer closed it', async () => {
    const channel = new SegmentChannel(2);
    let releases = 0;
    const segments = channel.segments(() => {
      releases += 1;
    });
    channel.push(bytes(1));
    channel.close();
    await segments.next();
    await expect(segments.next()).resolves.toMatchObject({ done: true });
    expect(releases).toBe(1);
  });

  it('releases a waiting producer and drops later pushes once closed', async () => {
    const channel = new SegmentChannel(1);
    channel.push(bytes(1));
    const room = channel.waitForRoom();
    channel.close();
    await expect(room).resolves.toBeUndefined();
    channel.push(bytes(2));
    await expect(collect(channel)).resolves.toEqual([1]);
  });

  it('throws the producer failure to the consumer after the segments before it', async () => {
    const channel = new SegmentChannel(4);
    const seen: number[] = [];
    channel.push(bytes(1));
    channel.fail(new Error('muxer broke'));
    const consumer = (async (): Promise<void> => {
      for await (const segment of channel.segments()) seen.push(segment[0] ?? -1);
    })();
    await expect(consumer).rejects.toThrow('muxer broke');
    expect(seen).toEqual([1]);
  });

  it('wraps a non-error failure in a typed error', async () => {
    const channel = new SegmentChannel(4);
    channel.fail('unexpected');
    await expect(collect(channel)).rejects.toMatchObject({ code: 'decode' });
  });
});
