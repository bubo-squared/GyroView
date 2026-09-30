import { ByteRange } from '@gyroview/core';
import { describeByteStreamContract } from '@gyroview/core/testing';
import { afterAll, describe, expect, it } from 'vitest';

import { HttpByteStream, type HttpByteStreamOptions } from './HttpByteStream';
import { HttpResource, type HttpResourceOptions } from './HttpResource';
import { TestServer, type TestServerBehaviour } from './test/testServer';

const BODY = Uint8Array.from({ length: 100 }, (_, index) => index);
const NO_WAIT = [0, 0];
const SLOW = { throttle: { chunkBytes: 10, intervalMs: 50 } };

const servers: TestServer[] = [];

async function serve(bytes: Uint8Array, behaviour: TestServerBehaviour = {}): Promise<TestServer> {
  const server = await TestServer.start(bytes, behaviour);
  servers.push(server);
  return server;
}

afterAll(async () => {
  await Promise.all(servers.map((server) => server.stop()));
});

function streamOf(
  url: string,
  options: HttpResourceOptions = {},
  streamOptions: HttpByteStreamOptions = {},
): HttpByteStream {
  return new HttpByteStream(new HttpResource(url, options), streamOptions);
}

function rangesAskedOf(server: TestServer): (string | undefined)[] {
  return server.requests
    .filter((request) => request.method === 'GET')
    .map((request) => request.range);
}

async function bytesOf(stream: HttpByteStream, range: ByteRange): Promise<number[]> {
  const chunks = await Array.fromAsync(stream.stream(range));
  return chunks.flatMap((chunk) => [...chunk]);
}

/**
 * A fetch that answers every byte range with `answer` and passes the size lookup on.
 */
function answeringRanges(answer: () => Response): typeof fetch {
  return (input, init) => (init?.method === 'GET' ? Promise.resolve(answer()) : fetch(input, init));
}

/**
 * A fetch that passes the first byte range on and answers every later one with a server error.
 */
function laterRangesFailing(): typeof fetch {
  let ranges = 0;
  return (input, init) => {
    if (init?.method === 'GET') ranges += 1;
    const isLaterRange = init?.method === 'GET' && ranges > 1;
    return isLaterRange ? Promise.resolve(new Response(null, { status: 503 })) : fetch(input, init);
  };
}

/**
 * A fetch that answers the first byte range with a server error and passes everything on.
 */
function firstRangeFailing(): typeof fetch {
  let ranges = 0;
  return (input, init) => {
    if (init?.method === 'GET') ranges += 1;
    const isFirstRange = init?.method === 'GET' && ranges === 1;
    return isFirstRange ? Promise.resolve(new Response(null, { status: 503 })) : fetch(input, init);
  };
}

describeByteStreamContract('over HTTP', async (bytes) => {
  const server = await serve(bytes);
  return streamOf(server.url);
});

describe('HttpByteStream', () => {
  it('hands each chunk on as it comes, before the range has all come', async () => {
    const server = await serve(BODY, SLOW);
    const chunks = streamOf(server.url).stream(ByteRange.of(0, 40))[Symbol.asyncIterator]();
    const first = await chunks.next();
    expect(first.done === true ? 0 : first.value.byteLength).toBeLessThan(40);
    await chunks.return?.();
  });

  it('ends the request at once when given up', async () => {
    const server = await serve(BODY, SLOW);
    const chunks = streamOf(server.url).stream(ByteRange.of(0, 100))[Symbol.asyncIterator]();
    await chunks.next();
    await chunks.return?.();
    await expect.poll(() => server.requests.at(-1)?.wasCutShort).toBe(true);
  });

  it('asks again for a range whose server fails on the way, and streams it', async () => {
    const server = await serve(BODY);
    const stream = streamOf(server.url, { fetch: firstRangeFailing(), retryDelaysMs: NO_WAIT });
    await expect(bytesOf(stream, ByteRange.of(10, 20))).resolves.toEqual([
      ...BODY.subarray(10, 30),
    ]);
  });

  it('reports a server that ignores Range requests with the range-unsupported code', async () => {
    const server = await serve(BODY, { ignoresRanges: true });
    await expect(bytesOf(streamOf(server.url), ByteRange.of(10, 20))).rejects.toMatchObject({
      code: 'range-unsupported',
    });
  });

  it('fails a range answered from other bytes than asked, naming both', async () => {
    const server = await serve(BODY);
    const otherBytes = answeringRanges(
      () =>
        new Response(BODY.subarray(0, 20), {
          status: 206,
          headers: { 'Content-Range': 'bytes 0-19/100' },
        }),
    );
    await expect(
      bytesOf(streamOf(server.url, { fetch: otherBytes }), ByteRange.of(10, 20)),
    ).rejects.toMatchObject({
      code: 'source-unreadable',
      message: `${server.url} answered bytes 0-19 to a request for bytes 10-29`,
    });
  });

  it('fails a range whose body comes short with source-truncated', async () => {
    const server = await serve(BODY);
    const short = answeringRanges(() => new Response(BODY.subarray(10, 25), { status: 206 }));
    await expect(
      bytesOf(streamOf(server.url, { fetch: short }), ByteRange.of(10, 20)),
    ).rejects.toMatchObject({
      code: 'source-truncated',
      message: `${server.url} returned 15 bytes for a 20-byte range at 10`,
    });
  });

  it('fails a range whose body runs past it', async () => {
    const server = await serve(BODY);
    const long = answeringRanges(() => new Response(BODY.subarray(10, 35), { status: 206 }));
    await expect(
      bytesOf(streamOf(server.url, { fetch: long }), ByteRange.of(10, 20)),
    ).rejects.toMatchObject({
      code: 'source-unreadable',
      message: `${server.url} sent more than the 20-byte range at 10`,
    });
  });

  it('asks for the rest of a range that broke off, from its next byte', async () => {
    const server = await serve(BODY, { breaksOffRanges: 1 });
    const stream = streamOf(server.url, { retryDelaysMs: NO_WAIT });
    await expect(bytesOf(stream, ByteRange.of(0, 100))).resolves.toEqual([...BODY]);
    expect(rangesAskedOf(server)).toEqual(['bytes=0-99', 'bytes=50-99']);
  });

  it('asks for the rest of a range that stalled, once no byte came for the stall timeout', async () => {
    const server = await serve(BODY, { stallsRanges: 1 });
    const stream = streamOf(server.url, { retryDelaysMs: NO_WAIT }, { stallTimeoutMs: 100 });
    await expect(bytesOf(stream, ByteRange.of(0, 100))).resolves.toEqual([...BODY]);
    expect(rangesAskedOf(server)).toEqual(['bytes=0-99', 'bytes=50-99']);
    expect(server.requests.find((request) => request.method === 'GET')?.wasCutShort).toBe(true);
  });

  it('fails a range whose rest cannot be had once the retries are spent', async () => {
    const server = await serve(BODY, { breaksOffRanges: 1 });
    const stream = streamOf(server.url, { fetch: laterRangesFailing(), retryDelaysMs: NO_WAIT });
    await expect(bytesOf(stream, ByteRange.of(0, 100))).rejects.toMatchObject({
      code: 'source-unreadable',
      message: `${server.url} answered 503 to a byte range`,
    });
  });

  it('given up while stalled, ends the request and asks for nothing more', async () => {
    const server = await serve(BODY, { stallsRanges: 1 });
    const chunks = streamOf(server.url).stream(ByteRange.of(0, 100))[Symbol.asyncIterator]();
    await chunks.next();
    const awaited = chunks.next();
    await chunks.return?.();
    await expect(awaited).resolves.toMatchObject({ done: true });
    await expect.poll(() => server.requests.at(-1)?.wasCutShort).toBe(true);
    expect(rangesAskedOf(server)).toEqual(['bytes=0-99']);
  });
});
