import { ByteRange } from '@gyroview/core';
import { describeRandomAccessSourceContract } from '@gyroview/core/testing';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { HttpRangeSource } from './HttpRangeSource';
import { HttpResource, type HttpResourceOptions } from './HttpResource';
import { TestServer } from './test/testServer';

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

function sourceAt(
  url: string,
  options?: HttpResourceOptions,
  signal?: AbortSignal,
): HttpRangeSource {
  return new HttpRangeSource(new HttpResource(url, options, signal));
}

afterAll(async () => {
  await Promise.all(servers.map((server) => server.stop()));
});

describeRandomAccessSourceContract(async (bytes) => {
  const server = await serve(bytes);
  return sourceAt(server.url);
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

/**
 * A fetch whose byte-range answers come as a cross-origin response that exposes no headers.
 */
async function hidingRangeHeaders(
  input: Parameters<typeof fetch>[0],
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(input, init);
  if (init?.method !== 'GET') return response;
  const hidden = new Response(null, { status: response.status });
  Object.defineProperty(hidden, 'type', { value: 'cors' });
  return hidden;
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

interface AnsweringHeads {
  readonly fetch: typeof fetch;
  /**
   * How many HEAD requests and byte ranges were asked for.
   */
  readonly asked: () => { heads: number; ranges: number };
}

/**
 * A fetch that answers the first HEAD requests with `statuses`, one each, and passes the rest on
 * to `passOn`.
 */
function headsAnswered(statuses: readonly number[], passOn: typeof fetch = fetch): AnsweringHeads {
  let heads = 0;
  let ranges = 0;
  return {
    asked: (): { heads: number; ranges: number } => ({ heads, ranges }),
    fetch: (input, init): Promise<Response> => {
      if (init?.method !== 'HEAD') {
        ranges += 1;
        return passOn(input, init);
      }
      const status = statuses[heads];
      heads += 1;
      return status === undefined
        ? passOn(input, init)
        : Promise.resolve(new Response(null, { status }));
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
    const source = sourceAt(server.url, { fetch: counting });
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
    const source = sourceAt(server.url, { fetch: flaky, retryDelaysMs: [] });
    await expect(source.size()).rejects.toMatchObject({ code: 'source-unreadable' });
    await expect(source.size()).resolves.toBe(5000);
  });

  it('asks again for the size after a request that did not get through', async () => {
    const server = await serve(content);
    let attempts = 0;
    // The first HEAD and the no-CORS probe that diagnoses its failure both find the network down.
    const flaky: typeof fetch = (input, init) => {
      attempts += 1;
      return attempts <= 2 ? Promise.reject(new Error('offline')) : fetch(input, init);
    };
    const source = sourceAt(server.url, { fetch: flaky, retryDelaysMs: NO_WAIT });
    await expect(source.size()).resolves.toBe(5000);
  });

  it('falls back to a one-byte range when HEAD carries no Content-Length', async () => {
    const server = await serve(content, { hidesContentLength: true });
    await expect(sourceAt(server.url).size()).resolves.toBe(5000);
  });

  it.each([405, 403])(
    'falls back to a one-byte range when the server refuses HEAD with %i',
    async (status) => {
      const server = await serve(content, { answersHeadWith: status });
      await expect(sourceAt(server.url).size()).resolves.toBe(5000);
    },
  );

  it('asks again for the size after a server error or a rate limit, and reads it from HEAD', async () => {
    const server = await serve(content);
    const busy = headsAnswered([503, 429]);
    const source = sourceAt(server.url, { fetch: busy.fetch, retryDelaysMs: NO_WAIT });
    await expect(source.size()).resolves.toBe(5000);
    expect(busy.asked()).toEqual({ heads: 3, ranges: 0 });
  });

  it('reads the size of a server that hides Content-Range from a HEAD asked again, not as cors', async () => {
    const server = await serve(content);
    const busy = headsAnswered([503], hidingRangeHeaders);
    const source = sourceAt(server.url, { fetch: busy.fetch, retryDelaysMs: NO_WAIT });
    await expect(source.size()).resolves.toBe(5000);
  });

  it('falls back to a one-byte range once a HEAD still fails when the waits ran out', async () => {
    const server = await serve(content);
    const failing = headsAnswered([503, 503, 503]);
    const source = sourceAt(server.url, { fetch: failing.fetch, retryDelaysMs: NO_WAIT });
    await expect(source.size()).resolves.toBe(5000);
    expect(failing.asked()).toEqual({ heads: 3, ranges: 1 });
  });

  it('falls back to a one-byte range at once when the server does not implement HEAD', async () => {
    const server = await serve(content);
    const unimplemented = headsAnswered([501]);
    const source = sourceAt(server.url, { fetch: unimplemented.fetch, retryDelaysMs: NO_WAIT });
    await expect(source.size()).resolves.toBe(5000);
    expect(unimplemented.asked()).toEqual({ heads: 1, ranges: 1 });
  });

  it('asks again for the one-byte size range after a server error', async () => {
    const server = await serve(content, { answersHeadWith: 405 });
    const busy = firstRangeAnswered(503);
    const source = sourceAt(server.url, { fetch: busy.fetch, retryDelaysMs: NO_WAIT });
    await expect(source.size()).resolves.toBe(5000);
    expect(busy.ranges()).toBe(2);
  });

  it('asks the range once after a HEAD still failing, and names its status', async () => {
    const server = await serve(content, { failsWith: 503 });
    const source = sourceAt(server.url, { retryDelaysMs: NO_WAIT });
    await expect(source.size()).rejects.toMatchObject({
      code: 'source-unreadable',
      message: expect.stringContaining('answered 503 to a byte range') as string,
    });
    expect(server.requests.map((request) => request.method)).toEqual([
      'HEAD',
      'HEAD',
      'HEAD',
      'GET',
    ]);
  });

  it('names a HEAD still failing, not cors, where the range that follows hides Content-Range', async () => {
    const server = await serve(content);
    const failing = headsAnswered([503, 503, 503], hidingRangeHeaders);
    const source = sourceAt(server.url, { fetch: failing.fetch, retryDelaysMs: NO_WAIT });
    await expect(source.size()).rejects.toMatchObject({
      code: 'source-unreadable',
      message: expect.stringContaining('answered 503 to HEAD') as string,
    });
  });

  it('names the status a size range still got when the waits ran out', async () => {
    const server = await serve(content, { answersHeadWith: 405 });
    let ranges = 0;
    const busy: typeof fetch = (input, init) => {
      if (init?.method !== 'GET') return fetch(input, init);
      ranges += 1;
      return Promise.resolve(new Response(null, { status: 503 }));
    };
    const source = sourceAt(server.url, { fetch: busy, retryDelaysMs: NO_WAIT });
    await expect(source.size()).rejects.toMatchObject({
      code: 'source-unreadable',
      message: expect.stringContaining('answered 503 to a byte range') as string,
    });
    expect(ranges).toBe(3);
  });

  it('ends a wait before asking again for the size as soon as its requests are aborted', async () => {
    const server = await serve(content);
    const load = new AbortController();
    const busy = headsAnswered([503]);
    const source = sourceAt(
      server.url,
      { fetch: busy.fetch, retryDelaysMs: [60_000] },
      load.signal,
    );
    const sizing = source.size();
    await vi.waitFor(() => {
      expect(busy.asked().heads).toBe(1);
    });
    load.abort();
    await expect(sizing).rejects.toMatchObject({ name: 'AbortError' });
    expect(busy.asked().heads).toBe(1);
  });

  it('names the status a size lookup got instead of a byte range', async () => {
    const server = await serve(content, { answersHeadWith: 405, ignoresRanges: true });
    await expect(sourceAt(server.url).size()).rejects.toMatchObject({
      code: 'source-unreadable',
      message: expect.stringContaining('answered 200 to a byte range') as string,
    });
  });

  it('reports a server that ignores Range requests with the range-unsupported code', async () => {
    const server = await serve(content, { ignoresRanges: true });
    await expect(sourceAt(server.url).read(ByteRange.of(0, 10))).rejects.toMatchObject({
      code: 'range-unsupported',
    });
  });

  it('reports HTTP failures with the source-unreadable code and the status', async () => {
    const server = await serve(content, { failsWith: 404 });
    await expect(sourceAt(server.url).size()).rejects.toMatchObject({
      code: 'source-unreadable',
      message: expect.stringContaining('404') as string,
    });
  });

  it('reports network failures with the source-unreadable code and keeps the cause', async () => {
    const source = sourceAt('http://127.0.0.1:1/unreachable.insv', { retryDelaysMs: NO_WAIT });
    await expect(source.size()).rejects.toMatchObject({
      code: 'source-unreadable',
      cause: expect.any(Error) as Error,
    });
  });

  it('asks again for a range whose body broke off, and reads it', async () => {
    const server = await serve(content, { breaksOffRanges: 1 });
    const source = sourceAt(server.url, { retryDelaysMs: NO_WAIT });
    await expect(source.read(ByteRange.of(0, 4000))).resolves.toEqual(content.subarray(0, 4000));
  });

  it('reports a range that keeps breaking off as source-unreadable once the retries are spent', async () => {
    const server = await serve(content, { breaksOffRanges: 3 });
    const source = sourceAt(server.url, { retryDelaysMs: NO_WAIT });
    await expect(source.read(ByteRange.of(0, 4000))).rejects.toMatchObject({
      code: 'source-unreadable',
      message: expect.stringContaining('broke off') as string,
    });
  });

  it('asks again after a server error, never after a refusal', async () => {
    const server = await serve(content);
    const busy = firstRangeAnswered(503);
    const recovering = sourceAt(server.url, {
      fetch: busy.fetch,
      retryDelaysMs: NO_WAIT,
    });
    await expect(recovering.read(ByteRange.of(0, 10))).resolves.toEqual(content.subarray(0, 10));
    const refusing = firstRangeAnswered(404);
    const refused = sourceAt(server.url, {
      fetch: refusing.fetch,
      retryDelaysMs: NO_WAIT,
    });
    await expect(refused.read(ByteRange.of(0, 10))).rejects.toMatchObject({
      code: 'source-unreadable',
    });
    expect(refusing.ranges()).toBe(1);
  });

  it('never asks again for a range a server does not implement (501)', async () => {
    const server = await serve(content);
    const unimplemented = firstRangeAnswered(501);
    const source = sourceAt(server.url, { fetch: unimplemented.fetch, retryDelaysMs: NO_WAIT });
    await source.size();
    await expect(source.read(ByteRange.of(0, 10))).rejects.toMatchObject({
      code: 'source-unreadable',
    });
    expect(unimplemented.ranges()).toBe(1);
  });

  it('asks again after a server that asks it to slow down, as rate-limited APIs answer', async () => {
    const server = await serve(content);
    const limited = firstRangeAnswered(429);
    const source = sourceAt(server.url, { fetch: limited.fetch, retryDelaysMs: NO_WAIT });
    await expect(source.read(ByteRange.of(0, 10))).resolves.toEqual(content.subarray(0, 10));
    expect(limited.ranges()).toBe(2);
  });

  it('fails at once with cors when the first range is refused, asking only once', async () => {
    const server = await serve(content);
    let ranges = 0;
    const refusing: typeof fetch = (input, init) => {
      if (init?.method === 'GET' && init.mode !== 'no-cors') {
        ranges += 1;
        return Promise.reject(new TypeError('CORS preflight refused'));
      }
      return fetch(input, init);
    };
    const source = sourceAt(server.url, { fetch: refusing, retryDelaysMs: NO_WAIT });
    await expect(source.read(ByteRange.of(0, 10))).rejects.toMatchObject({ code: 'cors' });
    expect(ranges).toBe(1);
  });

  it('says cors when a server that refuses HEAD hides Content-Range from this origin', async () => {
    const server = await serve(content, { answersHeadWith: 403 });
    await expect(sourceAt(server.url, { fetch: hidingRangeHeaders }).size()).rejects.toMatchObject({
      code: 'cors',
      message: expect.stringContaining('Access-Control-Expose-Headers') as string,
    });
  });

  it('takes the one-byte size lookup as proof of CORS for the reads after it', async () => {
    const server = await serve(content, { answersHeadWith: 405 });
    const answered = firstRangeFailing(false);
    let probes = 0;
    let isSized = false;
    const source = sourceAt(server.url, {
      fetch: (input, init): Promise<Response> => {
        if (init.mode === 'no-cors') probes += 1;
        return isSized ? answered(input, init) : fetch(input, init);
      },
      retryDelaysMs: NO_WAIT,
    });
    await source.size();
    isSized = true;
    await expect(source.read(ByteRange.of(0, 10))).resolves.toEqual(content.subarray(0, 10));
    expect(probes).toBe(0);
  });

  it('asks again for a range whose request did not get through', async () => {
    const server = await serve(content);
    const source = sourceAt(server.url, {
      fetch: firstRangeFailing(true),
      retryDelaysMs: NO_WAIT,
    });
    await expect(source.read(ByteRange.of(0, 10))).resolves.toEqual(content.subarray(0, 10));
  });

  it('asks again once a range came through, with no diagnosing request to the server', async () => {
    const server = await serve(content);
    const answered: typeof fetch = firstRangeFailing(false);
    let hasReadOnce = false;
    let probes = 0;
    const source = sourceAt(server.url, {
      fetch: (input, init): Promise<Response> => {
        if (init.mode === 'no-cors') probes += 1;
        return hasReadOnce ? answered(input, init) : fetch(input, init);
      },
      retryDelaysMs: NO_WAIT,
    });
    await source.read(ByteRange.of(0, 10));
    hasReadOnce = true;
    await expect(source.read(ByteRange.of(10, 10))).resolves.toEqual(content.subarray(10, 20));
    expect(probes).toBe(0);
  });

  it('ends a wait before asking again as soon as its requests are aborted', async () => {
    const server = await serve(content);
    const load = new AbortController();
    const busy = firstRangeAnswered(503);
    const source = sourceAt(
      server.url,
      { fetch: busy.fetch, retryDelaysMs: [60_000] },
      load.signal,
    );
    const reading = source.read(ByteRange.of(0, 10));
    await vi.waitFor(() => {
      expect(busy.ranges()).toBe(1);
    });
    load.abort();
    await expect(reading).rejects.toMatchObject({ name: 'AbortError' });
  });

  it("stops reading once its signal or the host's aborts", async () => {
    const server = await serve(content);
    const load = new AbortController();
    const source = sourceAt(server.url, {}, load.signal);
    load.abort();
    await expect(source.read(ByteRange.of(0, 10))).rejects.toMatchObject({ name: 'AbortError' });

    const host = new AbortController();
    const hosted = sourceAt(
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
    const source = sourceAt(server.url, { fetch: recording });
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
    const source = sourceAt(server.url, {
      requestInit: { headers: { Authorization: 'Bearer token' } },
      fetch: spying,
    });
    await source.read(ByteRange.of(100, 4));
    expect(seenHeaders?.get('authorization')).toBe('Bearer token');
    expect(seenHeaders?.get('range')).toBe('bytes=100-103');
  });

  it('fails with source-changed once the recording at the URL is replaced', async () => {
    const server = await serve(new Uint8Array(100), { validators: { etag: '"v1"' } });
    const source = sourceAt(server.url);
    await source.read(ByteRange.of(0, 10));
    server.replace(new Uint8Array(100), { etag: '"v2"' });
    await expect(source.read(ByteRange.of(10, 10))).rejects.toMatchObject({
      code: 'source-changed',
      message: `${server.url} was replaced while it played; load it again`,
    });
  });
});
