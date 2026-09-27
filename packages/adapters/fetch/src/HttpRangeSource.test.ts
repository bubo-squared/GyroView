import { ByteRange } from '@gyroview/core';
import { describeRandomAccessSourceContract } from '@gyroview/core/testing';
import { afterAll, describe, expect, it } from 'vitest';

import { HttpRangeSource } from './HttpRangeSource';
import { TestServer } from './testServer';

const servers: TestServer[] = [];
/**
 * Retries at once, so the tests of asking again take no time.
 */
const NO_WAIT = [0, 0];

async function serve(bytes: Uint8Array, behaviour = {}): Promise<TestServer> {
  const server = await TestServer.start(bytes, behaviour);
  servers.push(server);
  return server;
}

afterAll(async () => {
  await Promise.all(servers.map((server) => server.stop()));
});

describeRandomAccessSourceContract(async (bytes) => {
  const server = await serve(bytes);
  return new HttpRangeSource(server.url);
});

/**
 * A fetch whose first byte-range request fails outright; the no-CORS probe that diagnoses the
 * failure fails too when `isServerGone`, and answers otherwise, as a server whose error page
 * lacks CORS headers does.
 */
function firstRangeFailing(isServerGone: boolean): typeof fetch {
  let ranges = 0;
  return (input, init) => {
    const isProbe = init?.mode === 'no-cors';
    if (isProbe && isServerGone) return Promise.reject(new TypeError('offline'));
    if (init?.method !== 'GET') return fetch(input, init);
    ranges += 1;
    return ranges === 1 ? Promise.reject(new TypeError('network changed')) : fetch(input, init);
  };
}

interface CountingFetch {
  readonly fetch: typeof fetch;
  /**
   * How many byte ranges were asked for.
   */
  readonly ranges: () => number;
}

/**
 * A fetch that answers the first byte range with `status` and passes everything else on.
 */
function firstRangeAnswered(status: number): CountingFetch {
  let ranges = 0;
  return {
    ranges: (): number => ranges,
    fetch: (input, init): Promise<Response> => {
      if (init?.method !== 'GET') return fetch(input, init);
      ranges += 1;
      return ranges === 1 ? Promise.resolve(new Response(null, { status })) : fetch(input, init);
    },
  };
}

describe('HttpRangeSource', () => {
  const content = Uint8Array.from({ length: 5000 }, (_value, index) => index % 256);

  it('asks for the size once and reuses it', async () => {
    let headRequests = 0;
    const server = await serve(content);
    const counting: typeof fetch = async (input, init) => {
      if (init?.method === 'HEAD') headRequests += 1;
      return fetch(input, init);
    };
    const source = new HttpRangeSource(server.url, { fetch: counting });
    await source.size();
    await source.size();
    await source.read(ByteRange.of(10, 5));
    expect(headRequests).toBe(1);
  });

  it('retries the size lookup after a failed HEAD instead of caching the failure', async () => {
    const server = await serve(content);
    let attempts = 0;
    // The first HEAD and the no-CORS probe that diagnoses its failure both find the network down.
    const flaky: typeof fetch = (input, init) => {
      attempts += 1;
      return attempts <= 2 ? Promise.reject(new Error('offline')) : fetch(input, init);
    };
    const source = new HttpRangeSource(server.url, { fetch: flaky });
    await expect(source.size()).rejects.toMatchObject({ code: 'source-unreadable' });
    await expect(source.size()).resolves.toBe(5000);
  });

  it('falls back to a one-byte range when HEAD carries no Content-Length', async () => {
    const server = await serve(content, { hidesContentLength: true });
    await expect(new HttpRangeSource(server.url).size()).resolves.toBe(5000);
  });

  it.each([405, 403])(
    'falls back to a one-byte range when the server refuses HEAD with %i',
    async (status) => {
      const server = await serve(content, { answersHeadWith: status });
      await expect(new HttpRangeSource(server.url).size()).resolves.toBe(5000);
    },
  );

  it('names the status a size lookup got instead of a byte range', async () => {
    const server = await serve(content, { answersHeadWith: 405, ignoresRanges: true });
    await expect(new HttpRangeSource(server.url).size()).rejects.toMatchObject({
      code: 'source-unreadable',
      message: expect.stringContaining('answered 200 to a byte range') as string,
    });
  });

  it('reports a server that ignores Range requests with the range-unsupported code', async () => {
    const server = await serve(content, { ignoresRanges: true });
    await expect(new HttpRangeSource(server.url).read(ByteRange.of(0, 10))).rejects.toMatchObject({
      code: 'range-unsupported',
    });
  });

  it('reports HTTP failures with the source-unreadable code and the status', async () => {
    const server = await serve(content, { failsWith: 404 });
    await expect(new HttpRangeSource(server.url).size()).rejects.toMatchObject({
      code: 'source-unreadable',
      message: expect.stringContaining('404') as string,
    });
  });

  it('reports network failures with the source-unreadable code and keeps the cause', async () => {
    const source = new HttpRangeSource('http://127.0.0.1:1/unreachable.insv');
    await expect(source.size()).rejects.toMatchObject({
      code: 'source-unreadable',
      cause: expect.any(Error) as Error,
    });
  });

  it('asks again for a range whose body broke off, and reads it', async () => {
    const server = await serve(content, { breaksOffRanges: 1 });
    const source = new HttpRangeSource(server.url, { retryDelaysMs: NO_WAIT });
    await expect(source.read(ByteRange.of(0, 4000))).resolves.toEqual(content.subarray(0, 4000));
  });

  it('reports a range that keeps breaking off as source-unreadable once the retries are spent', async () => {
    const server = await serve(content, { breaksOffRanges: 3 });
    const source = new HttpRangeSource(server.url, { retryDelaysMs: NO_WAIT });
    await expect(source.read(ByteRange.of(0, 4000))).rejects.toMatchObject({
      code: 'source-unreadable',
      message: expect.stringContaining('broke off') as string,
    });
  });

  it('asks again after a server error, never after a refusal', async () => {
    const server = await serve(content);
    const busy = firstRangeAnswered(503);
    const recovering = new HttpRangeSource(server.url, {
      fetch: busy.fetch,
      retryDelaysMs: NO_WAIT,
    });
    await expect(recovering.read(ByteRange.of(0, 10))).resolves.toEqual(content.subarray(0, 10));
    const refusing = firstRangeAnswered(404);
    const refused = new HttpRangeSource(server.url, {
      fetch: refusing.fetch,
      retryDelaysMs: NO_WAIT,
    });
    await expect(refused.read(ByteRange.of(0, 10))).rejects.toMatchObject({
      code: 'source-unreadable',
    });
    expect(refusing.ranges()).toBe(1);
  });

  it('asks again for a range whose request did not get through', async () => {
    const server = await serve(content);
    const source = new HttpRangeSource(server.url, {
      fetch: firstRangeFailing(true),
      retryDelaysMs: NO_WAIT,
    });
    await expect(source.read(ByteRange.of(0, 10))).resolves.toEqual(content.subarray(0, 10));
  });

  it('asks again once a range came through, though the failure looks like CORS', async () => {
    const server = await serve(content);
    const answered: typeof fetch = firstRangeFailing(false);
    let hasReadOnce = false;
    const source = new HttpRangeSource(server.url, {
      fetch: (input, init): Promise<Response> =>
        hasReadOnce ? answered(input, init) : fetch(input, init),
      retryDelaysMs: NO_WAIT,
    });
    await source.read(ByteRange.of(0, 10));
    hasReadOnce = true;
    await expect(source.read(ByteRange.of(10, 10))).resolves.toEqual(content.subarray(10, 20));
  });

  it("stops reading once its signal or the host's aborts", async () => {
    const server = await serve(content);
    const load = new AbortController();
    const source = new HttpRangeSource(server.url, {}, load.signal);
    load.abort();
    await expect(source.read(ByteRange.of(0, 10))).rejects.toMatchObject({ name: 'AbortError' });

    const host = new AbortController();
    const hosted = new HttpRangeSource(
      server.url,
      { requestInit: { signal: host.signal } },
      new AbortController().signal,
    );
    host.abort();
    await expect(hosted.read(ByteRange.of(0, 10))).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('reads an empty range inside the file with no GET, only the size lookup', async () => {
    const server = await serve(content);
    const methods: string[] = [];
    const recording: typeof fetch = (input, init) => {
      methods.push(init?.method ?? 'GET');
      return fetch(input, init);
    };
    const source = new HttpRangeSource(server.url, { fetch: recording });
    await expect(source.read(ByteRange.of(3, 0))).resolves.toEqual(new Uint8Array());
    expect(methods).toEqual(['HEAD']);
  });

  it('passes caller headers through and sets Range itself', async () => {
    let seenHeaders: Headers | undefined;
    const server = await serve(content);
    const spying: typeof fetch = async (input, init) => {
      seenHeaders = new Headers(init?.headers);
      return fetch(input, init);
    };
    const source = new HttpRangeSource(server.url, {
      requestInit: { headers: { Authorization: 'Bearer token' } },
      fetch: spying,
    });
    await source.read(ByteRange.of(100, 4));
    expect(seenHeaders?.get('authorization')).toBe('Bearer token');
    expect(seenHeaders?.get('range')).toBe('bytes=100-103');
  });
});
