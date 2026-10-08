import { ByteRange } from '@gyroview/core';
import { describe, expect, it, vi } from 'vitest';

import { browserPorts } from './browserPorts';
import type { RecordingFetch, UrlInput } from '../PlayerSource';

const RECORDING_URL = 'https://media.example/clips/VID_20260814_132640_00_013.insv';
const RECORDING_SIZE = 4096;

interface SeenRequest {
  readonly method: string | undefined;
  readonly credentials: RequestCredentials | undefined;
}

/**
 * Every request the ports make, answered as a server that knows the file: its size to a HEAD,
 * its bytes to a range.
 */
function recordingServer(): { readonly fetch: typeof fetch; readonly seen: SeenRequest[] } {
  const seen: SeenRequest[] = [];
  return {
    seen,
    fetch: (_input, init): Promise<Response> => {
      seen.push({ method: init?.method, credentials: init?.credentials });
      return Promise.resolve(answerTo(new Headers(init?.headers).get('range')));
    },
  };
}

function answerTo(range: string | null): Response {
  const asked = /^bytes=(\d+)-(\d+)$/u.exec(range ?? '');
  if (!asked) {
    return new Response(null, { headers: { 'Content-Length': String(RECORDING_SIZE) } });
  }
  const [first, last] = [Number(asked[1]), Number(asked[2])];
  const headers = { 'Content-Range': `bytes ${first}-${last}/${RECORDING_SIZE}` };
  return new Response(new Uint8Array(last - first + 1), { status: 206, headers });
}

function credentialsOf(requests: readonly SeenRequest[]): (RequestCredentials | undefined)[] {
  return requests.map((request) => request.credentials);
}

/**
 * Reads the recording's size and looks for it beside itself: one request through each port.
 */
async function readAndLocate(
  ports: ReturnType<typeof browserPorts>,
  input: UrlInput,
): Promise<void> {
  await ports.sources.open(input, new AbortController().signal).source.size();
  await ports.locatorFor(input).exists(input.url);
}

/**
 * A page's fetch that counts its calls before sending them as they are.
 */
function countingFetch(send: typeof fetch): {
  readonly fetch: RecordingFetch;
  readonly calls: () => number;
} {
  let calls = 0;
  return {
    calls: (): number => calls,
    fetch: (url, init): Promise<Response> => {
      calls += 1;
      return send(url, init);
    },
  };
}

describe('browserPorts', () => {
  it('reads a recording and looks beside it with the credentials its input names', async () => {
    const server = recordingServer();
    const ports = browserPorts({
      http: { fetch: server.fetch, requestInit: { credentials: 'omit' } },
    });

    await readAndLocate(ports, { url: RECORDING_URL, credentials: 'include' });

    expect(credentialsOf(server.seen)).toEqual(['include', 'include']);
  });

  it('keeps the shared request settings for an input that names no credentials', async () => {
    const server = recordingServer();
    const ports = browserPorts({
      http: { fetch: server.fetch, requestInit: { credentials: 'omit' } },
    });

    await readAndLocate(ports, { url: RECORDING_URL });

    expect(credentialsOf(server.seen)).toEqual(['omit', 'omit']);
  });

  it("reads a recording and looks beside it through its input's fetch, in place of the shared one", async () => {
    const server = recordingServer();
    const shared = countingFetch(server.fetch);
    const own = countingFetch(server.fetch);
    const ports = browserPorts({ http: { fetch: shared.fetch } });

    await readAndLocate(ports, { url: RECORDING_URL, fetch: own.fetch });

    expect(own.calls()).toBe(2);
    expect(shared.calls()).toBe(0);
  });

  it('sends the credentials an input names through its own fetch', async () => {
    const server = recordingServer();
    const own = countingFetch(server.fetch);
    const ports = browserPorts({ http: { requestInit: { credentials: 'omit' } } });

    await readAndLocate(ports, { url: RECORDING_URL, credentials: 'include', fetch: own.fetch });

    expect(credentialsOf(server.seen)).toEqual(['include', 'include']);
    expect(own.calls()).toBe(2);
  });

  it('reads an input that names neither credentials nor fetch as it always did', async () => {
    const signed = `${RECORDING_URL}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=abc`;
    const sent: [string, RequestInit][] = [];
    const platformFetch = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      sent.push([input instanceof Request ? input.url : input.toString(), init ?? {}]);
      return Promise.resolve(answerTo(new Headers(init?.headers).get('range')));
    });
    try {
      const ports = browserPorts();
      const { source } = ports.sources.open({ url: signed }, new AbortController().signal);
      await source.size();
      await source.read(ByteRange.of(0, 4));
      await ports.locatorFor({ url: signed }).exists(signed);
    } finally {
      platformFetch.mockRestore();
    }

    expect(sent).toStrictEqual([
      [
        signed,
        {
          cache: 'no-store',
          signal: expect.any(AbortSignal) as AbortSignal,
          method: 'HEAD',
          headers: {},
        },
      ],
      [
        signed,
        {
          cache: 'no-store',
          signal: expect.any(AbortSignal) as AbortSignal,
          method: 'GET',
          headers: { Range: 'bytes=0-3' },
        },
      ],
      [signed, { cache: 'no-store', method: 'HEAD', headers: {} }],
    ]);
  });

  it("reads an input with the visitor's cookies as it always did, as an element with crossorigin does", async () => {
    const sent: [string, RequestInit][] = [];
    const platformFetch = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      sent.push([input instanceof Request ? input.url : input.toString(), init ?? {}]);
      return Promise.resolve(answerTo(new Headers(init?.headers).get('range')));
    });
    try {
      const ports = browserPorts();
      const input = { url: RECORDING_URL, credentials: 'include' as const };
      const { source } = ports.sources.open(input, new AbortController().signal);
      await source.size();
      await source.read(ByteRange.of(0, 4));
      await ports.locatorFor(input).exists(RECORDING_URL);
    } finally {
      platformFetch.mockRestore();
    }

    const signal = expect.any(AbortSignal) as AbortSignal;
    expect(sent).toStrictEqual([
      [
        RECORDING_URL,
        { cache: 'no-store', credentials: 'include', signal, method: 'HEAD', headers: {} },
      ],
      [
        RECORDING_URL,
        {
          cache: 'no-store',
          credentials: 'include',
          signal,
          method: 'GET',
          headers: { Range: 'bytes=0-3' },
        },
      ],
      [RECORDING_URL, { cache: 'no-store', credentials: 'include', method: 'HEAD', headers: {} }],
    ]);
  });

  it('tells how long the server took to answer a range once one was read, and nothing of a local file', async () => {
    const server = recordingServer();
    const ports = browserPorts({ http: { fetch: server.fetch } });
    const opened = ports.sources.open({ url: RECORDING_URL }, new AbortController().signal);
    await opened.source.size();
    expect(opened.answerWait?.()).toBeUndefined();

    await opened.source.read(ByteRange.of(0, 4));

    expect(opened.answerWait?.()).toBeGreaterThanOrEqual(0);
    const local = ports.sources.open(
      { blob: new Blob([new Uint8Array(8)]), name: 'VID_20260814_132640_00_013.insv' },
      new AbortController().signal,
    );
    expect(local.answerWait).toBeUndefined();
  });

  it('streams a recording with the credentials its input names, its size looked up once', async () => {
    const server = recordingServer();
    const ports = browserPorts({ http: { fetch: server.fetch } });
    const input = { url: RECORDING_URL, credentials: 'include' as const };
    const { source, stream } = ports.sources.open(input, new AbortController().signal);

    await source.size();
    const chunks = await Array.fromAsync(stream.stream(ByteRange.of(0, 100)));

    expect(chunks.reduce((total, chunk) => total + chunk.byteLength, 0)).toBe(100);
    expect(server.seen).toEqual([
      { method: 'HEAD', credentials: 'include' },
      { method: 'GET', credentials: 'include' },
    ]);
  });
});
