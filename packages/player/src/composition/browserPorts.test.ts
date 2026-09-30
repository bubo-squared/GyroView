import { ByteRange } from '@gyroview/core';
import { describe, expect, it } from 'vitest';

import { browserPorts } from './browserPorts';
import type { UrlInput } from '../PlayerSource';

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
