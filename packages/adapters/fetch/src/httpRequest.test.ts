import { describe, expect, it } from 'vitest';

import { discardBody, httpRequest } from './httpRequest';

const URL_UNDER_TEST = 'https://media.example/clip.insv';

/**
 * A fetch that fails every ordinary request and answers a no-CORS probe as the browser would
 * when the server is up but withholds CORS headers.
 */
const blockedByCors: typeof fetch = (_input, init) =>
  init?.mode === 'no-cors'
    ? Promise.resolve(new Response(null, { status: 200 }))
    : Promise.reject(new TypeError('Failed to fetch'));

const offline: typeof fetch = () => Promise.reject(new TypeError('Failed to fetch'));

describe('httpRequest', () => {
  it('names a CORS refusal when the server still answers a no-CORS probe', async () => {
    await expect(
      httpRequest(URL_UNDER_TEST, { method: 'GET' }, { fetch: blockedByCors }),
    ).rejects.toMatchObject({
      code: 'cors',
      message: expect.stringContaining('Access-Control-Allow-Origin') as string,
      cause: expect.objectContaining({ message: 'Failed to fetch' }) as unknown,
    });
  });

  it('names the stricter rule for a CORS refusal of a request sent with credentials', async () => {
    const failure = httpRequest(
      URL_UNDER_TEST,
      { method: 'GET' },
      { fetch: blockedByCors, requestInit: { credentials: 'include' } },
    );
    await expect(failure).rejects.toMatchObject({
      code: 'cors',
      message: expect.stringMatching(/not \*.*Access-Control-Allow-Credentials: true/u) as string,
    });
  });

  it('asks for no credentials rule when the request carried none', async () => {
    await expect(
      httpRequest(URL_UNDER_TEST, { method: 'GET' }, { fetch: blockedByCors }),
    ).rejects.toMatchObject({
      message: expect.not.stringContaining('Access-Control-Allow-Credentials') as string,
    });
  });

  it('reports an unreachable server as unreadable', async () => {
    await expect(
      httpRequest(URL_UNDER_TEST, { method: 'HEAD' }, { fetch: offline }),
    ).rejects.toMatchObject({ code: 'source-unreadable' });
  });

  it('passes the abort of a caller on as it is, without probing the server', async () => {
    const calls: (RequestInit | undefined)[] = [];
    const aborted: typeof fetch = (_input, init) => {
      calls.push(init);
      return Promise.reject(new DOMException('the caller gave up', 'AbortError'));
    };
    await expect(
      httpRequest(URL_UNDER_TEST, { method: 'GET' }, { fetch: aborted }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(calls).toHaveLength(1);
  });

  it('ends the diagnosing probe with the request it diagnoses when the caller aborts', async () => {
    const load = new AbortController();
    const hanging: typeof fetch = (_input, init) => {
      if (init?.mode !== 'no-cors') return Promise.reject(new TypeError('Failed to fetch'));
      load.abort();
      return init.signal?.aborted === true
        ? Promise.reject(new DOMException('the caller gave up', 'AbortError'))
        : new Promise<Response>(() => {
            // A server that accepts the probe and never answers.
          });
    };
    await expect(
      httpRequest(
        URL_UNDER_TEST,
        { method: 'GET' },
        { fetch: hanging, requestInit: { signal: load.signal } },
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('passes the shared request settings and the request headers through', async () => {
    const seen: RequestInit[] = [];
    const recording: typeof fetch = (_input, init) => {
      if (init) seen.push(init);
      return Promise.resolve(new Response(null, { status: 206 }));
    };
    await httpRequest(
      URL_UNDER_TEST,
      { method: 'GET', headers: { Range: 'bytes=0-1' } },
      { fetch: recording, requestInit: { credentials: 'include', headers: [['X-Test', 'yes']] } },
    );
    expect(seen[0]?.method).toBe('GET');
    expect(seen[0]?.credentials).toBe('include');
    expect(new Headers(seen[0]?.headers).get('range')).toBe('bytes=0-1');
    expect(new Headers(seen[0]?.headers).get('x-test')).toBe('yes');
  });

  it('keeps every request out of the browser cache, which serves byte ranges unreliably', async () => {
    const seen: RequestInit[] = [];
    const recording: typeof fetch = (_input, init) => {
      if (init) seen.push(init);
      return Promise.resolve(new Response(null, { status: 206 }));
    };
    await httpRequest(URL_UNDER_TEST, { method: 'GET' }, { fetch: recording });
    await httpRequest(URL_UNDER_TEST, { method: 'HEAD' }, { fetch: recording, requestInit: {} });
    expect(seen.map((init) => init.cache)).toEqual(['no-store', 'no-store']);
  });

  it('lets the shared request settings choose another cache mode', async () => {
    const seen: RequestInit[] = [];
    const recording: typeof fetch = (_input, init) => {
      if (init) seen.push(init);
      return Promise.resolve(new Response(null, { status: 206 }));
    };
    await httpRequest(
      URL_UNDER_TEST,
      { method: 'GET' },
      { fetch: recording, requestInit: { cache: 'default' } },
    );
    expect(seen[0]?.cache).toBe('default');
  });
});

describe('discardBody', () => {
  it("lets go of a body its request's abort already ended, leaving no rejection unhandled", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);
    const aborted = new Response(
      new ReadableStream({
        start: (controller): void => {
          controller.error(new DOMException('Fetch is aborted', 'AbortError'));
        },
      }),
    );
    discardBody(aborted);
    await new Promise((resolve) => setImmediate(resolve));
    process.off('unhandledRejection', onUnhandled);
    expect(unhandled).toEqual([]);
  });
});
