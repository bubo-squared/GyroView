import { describeResourceLocatorContract } from '@gyroview/core/testing';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { HttpResourceLocator } from './HttpResourceLocator';
import { headsAnswered } from './test/answeringFetch';
import { TestServer } from './test/testServer';

const servers: TestServer[] = [];
const content = Uint8Array.from({ length: 100 }, (_value, index) => index);

async function serve(behaviour = {}): Promise<TestServer> {
  const server = await TestServer.start(content, behaviour);
  servers.push(server);
  return server;
}

afterAll(async () => {
  await Promise.all(servers.map((server) => server.stop()));
});

const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_METHOD_NOT_ALLOWED = 405;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_NOT_IMPLEMENTED = 501;
const HTTP_SERVICE_UNAVAILABLE = 503;
/**
 * Asks again at once, so the tests of asking again take no time.
 */
const NO_WAIT = [0, 0];

describeResourceLocatorContract(async () => {
  const existing = await serve();
  const missing = await serve({ failsWith: HTTP_NOT_FOUND });
  const unanswered = await serve({ failsWith: HTTP_SERVICE_UNAVAILABLE });
  return {
    locator: new HttpResourceLocator({ retryDelaysMs: NO_WAIT }),
    existing: existing.url,
    missing: missing.url,
    unanswered: unanswered.url,
  };
});

describe('HttpResourceLocator', () => {
  it('answers true for a URL the server serves, with a single HEAD request', async () => {
    const server = await serve();
    const methods: string[] = [];
    const recording: typeof fetch = (input, init) => {
      methods.push(init?.method ?? 'GET');
      return fetch(input, init);
    };
    await expect(new HttpResourceLocator({ fetch: recording }).exists(server.url)).resolves.toBe(
      true,
    );
    expect(methods).toEqual(['HEAD']);
  });

  it('spends no request explaining a failed lookup', async () => {
    let calls = 0;
    const offline: typeof fetch = () => {
      calls += 1;
      return Promise.reject(new TypeError('Failed to fetch'));
    };
    await expect(
      new HttpResourceLocator({ fetch: offline }).exists('https://x.example/a'),
    ).resolves.toBe(false);
    expect(calls).toBe(1);
  });

  it.each([
    ['not allowed', HTTP_METHOD_NOT_ALLOWED],
    ['forbidden to a URL signed for GET alone', HTTP_FORBIDDEN],
    ['not implemented', HTTP_NOT_IMPLEMENTED],
  ])('falls back to a one-byte GET when HEAD is %s', async (_refusal, status) => {
    const server = await serve({ answersHeadWith: status });
    await expect(new HttpResourceLocator().exists(server.url)).resolves.toBe(true);
  });

  it('asks again after a server error or a rate limit, and finds the file', async () => {
    const server = await serve();
    const busy = headsAnswered([HTTP_SERVICE_UNAVAILABLE, HTTP_TOO_MANY_REQUESTS]);
    const locator = new HttpResourceLocator({ fetch: busy.fetch, retryDelaysMs: NO_WAIT });
    await expect(locator.exists(server.url)).resolves.toBe(true);
    expect(busy.asked()).toEqual({ heads: 3, gets: 0 });
  });

  it('asks again for the one-byte GET where HEAD is refused', async () => {
    const server = await serve({ answersHeadWith: HTTP_METHOD_NOT_ALLOWED });
    let gets = 0;
    const firstGetBusy: typeof fetch = (input, init) => {
      if (init?.method !== 'GET') return fetch(input, init);
      gets += 1;
      return gets === 1
        ? Promise.resolve(new Response(null, { status: HTTP_SERVICE_UNAVAILABLE }))
        : fetch(input, init);
    };
    const locator = new HttpResourceLocator({ fetch: firstGetBusy, retryDelaysMs: NO_WAIT });
    await expect(locator.exists(server.url)).resolves.toBe(true);
    expect(gets).toBe(2);
  });

  it('asks the one-byte GET once after a HEAD still failing, and finds the file', async () => {
    const server = await serve();
    const failingHead = headsAnswered([
      HTTP_SERVICE_UNAVAILABLE,
      HTTP_SERVICE_UNAVAILABLE,
      HTTP_SERVICE_UNAVAILABLE,
    ]);
    const locator = new HttpResourceLocator({ fetch: failingHead.fetch, retryDelaysMs: NO_WAIT });
    await expect(locator.exists(server.url)).resolves.toBe(true);
    expect(failingHead.asked()).toEqual({ heads: 3, gets: 1 });
  });

  it('fails as unreadable when its server still fails once the waits ran out', async () => {
    const server = await serve({ failsWith: HTTP_SERVICE_UNAVAILABLE });
    const locator = new HttpResourceLocator({ retryDelaysMs: NO_WAIT });
    await expect(locator.exists(server.url)).rejects.toMatchObject({
      code: 'source-unreadable',
      message: expect.stringContaining('answered 503') as string,
    });
    const methods = server.requests.map((request) => request.method);
    expect(methods).toEqual(['HEAD', 'HEAD', 'HEAD', 'GET']);
  });

  it('ends a wait before asking again as soon as its lookup is aborted', async () => {
    const server = await serve();
    const busy = headsAnswered([HTTP_SERVICE_UNAVAILABLE]);
    const lookup = new AbortController();
    const locator = new HttpResourceLocator(
      { fetch: busy.fetch, retryDelaysMs: [60_000] },
      lookup.signal,
    );
    const looking = locator.exists(server.url);
    await vi.waitFor(() => {
      expect(busy.asked().heads).toBe(1);
    });
    lookup.abort();
    await expect(looking).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('fails a lookup its signal ends, whatever the reason, rather than answer false', async () => {
    const server = await serve();
    const lookup = new AbortController();
    lookup.abort(new DOMException('the load took too long', 'TimeoutError'));
    const locator = new HttpResourceLocator({}, lookup.signal);
    await expect(locator.exists(server.url)).rejects.toMatchObject({ name: 'TimeoutError' });
  });

  it('answers false instead of throwing when the server is unreachable', async () => {
    const server = await serve();
    await server.stop();
    servers.pop();
    await expect(new HttpResourceLocator().exists(server.url)).resolves.toBe(false);
  });
});
