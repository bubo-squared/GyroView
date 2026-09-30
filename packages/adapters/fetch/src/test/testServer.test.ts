import { afterEach, describe, expect, it } from 'vitest';

import { TestServer, type TestServerBehaviour } from './testServer';

const BODY = Uint8Array.from({ length: 100 }, (_, index) => index);
const WEDNESDAY = 'Wed, 30 Sep 2026 10:00:00 GMT';
const THURSDAY = 'Thu, 01 Oct 2026 10:00:00 GMT';
const CHUNK_INTERVAL_MS = 20;

const servers: TestServer[] = [];

async function serve(behaviour: TestServerBehaviour = {}): Promise<TestServer> {
  const server = await TestServer.start(BODY, behaviour);
  servers.push(server);
  return server;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop()));
});

function askRange(url: string, range: string, signal?: AbortSignal): Promise<Response> {
  return fetch(url, { headers: { Range: range }, ...(signal && { signal }) });
}

async function bodyOf(request: Promise<Response>): Promise<Uint8Array> {
  const response = await request;
  return new Uint8Array(await response.arrayBuffer());
}

async function chunksOf(request: Promise<Response>): Promise<Uint8Array[]> {
  const response = await request;
  const chunks: Uint8Array[] = [];
  const reader = response.body?.getReader();
  for (let read = await reader?.read(); read && !read.done; read = await reader?.read()) {
    chunks.push(read.value);
  }
  return chunks;
}

async function isStillWaiting(pending: Promise<unknown>, ms: number): Promise<boolean> {
  const waited = Symbol('waited');
  const outcome = await Promise.race([
    pending,
    new Promise((resolve) => setTimeout(resolve, ms, waited)),
  ]);
  return outcome === waited;
}

function validatorsOf(response: Response): (string | null)[] {
  return [response.headers.get('etag'), response.headers.get('last-modified')];
}

describe('TestServer', () => {
  it('logs every request with its method and range, and whether its answer came whole', async () => {
    const server = await serve();
    await bodyOf(fetch(server.url, { method: 'HEAD' }));
    await bodyOf(askRange(server.url, 'bytes=0-9'));
    expect(server.requests).toEqual([
      { method: 'HEAD', range: undefined, wasCutShort: false },
      { method: 'GET', range: 'bytes=0-9', wasCutShort: false },
    ]);
  });

  it('sends a range a chunk at a time when throttled', async () => {
    const server = await serve({ throttle: { chunkBytes: 10, intervalMs: CHUNK_INTERVAL_MS } });
    const started = performance.now();
    const chunks = await chunksOf(askRange(server.url, 'bytes=0-29'));
    expect(performance.now() - started).toBeGreaterThanOrEqual(2 * CHUNK_INTERVAL_MS);
    expect(chunks.flatMap((chunk) => [...chunk])).toEqual([...BODY.subarray(0, 30)]);
  });

  it('stalls the first ranges halfway, holding on until the client gives up', async () => {
    const server = await serve({ stallsRanges: 1 });
    const abort = new AbortController();
    const response = await askRange(server.url, 'bytes=0-99', abort.signal);
    const reader = response.body?.getReader();
    const first = await reader?.read();
    expect(first?.value?.byteLength).toBe(50);
    const next = reader?.read() ?? Promise.resolve();
    await expect(isStillWaiting(next, 5 * CHUNK_INTERVAL_MS)).resolves.toBe(true);
    abort.abort();
    await expect(next).rejects.toThrow();
    await expect(bodyOf(askRange(server.url, 'bytes=0-99'))).resolves.toHaveLength(100);
    await expect.poll(() => server.requests[0]?.wasCutShort).toBe(true);
  });

  it('answers with its validators, and new bytes and validators once the recording is replaced', async () => {
    const server = await serve({ validators: { etag: '"v1"', lastModified: WEDNESDAY } });
    expect(validatorsOf(await askRange(server.url, 'bytes=0-1'))).toEqual(['"v1"', WEDNESDAY]);
    server.replace(BODY.toReversed(), { etag: '"v2"', lastModified: THURSDAY });
    const after = await askRange(server.url, 'bytes=0-1');
    expect(validatorsOf(after)).toEqual(['"v2"', THURSDAY]);
    expect([...new Uint8Array(await after.arrayBuffer())]).toEqual([99, 98]);
  });
});
