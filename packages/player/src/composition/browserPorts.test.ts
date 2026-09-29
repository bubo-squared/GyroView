import { describe, expect, it } from 'vitest';

import { browserPorts } from './browserPorts';
import type { UrlInput } from '../PlayerSource';

const RECORDING_URL = 'https://media.example/clips/VID_20260814_132640_00_013.insv';
const RECORDING_SIZE = 4096;

/**
 * The credentials of every request the ports make, answered as a server that knows the file.
 */
function recordingCredentials(): {
  readonly fetch: typeof fetch;
  readonly seen: (RequestCredentials | undefined)[];
} {
  const seen: (RequestCredentials | undefined)[] = [];
  return {
    seen,
    fetch: (_input, init): Promise<Response> => {
      seen.push(init?.credentials);
      const headers = { 'Content-Length': String(RECORDING_SIZE) };
      return Promise.resolve(new Response(null, { status: 200, headers }));
    },
  };
}

/**
 * Reads the recording's size and looks for it beside itself: one request through each port.
 */
async function readAndLocate(
  ports: ReturnType<typeof browserPorts>,
  input: UrlInput,
): Promise<void> {
  await ports.sources.open(input, new AbortController().signal).size();
  await ports.locatorFor(input).exists(input.url);
}

describe('browserPorts', () => {
  it('reads a recording and looks beside it with the credentials its input names', async () => {
    const server = recordingCredentials();
    const ports = browserPorts({
      http: { fetch: server.fetch, requestInit: { credentials: 'omit' } },
    });

    await readAndLocate(ports, { url: RECORDING_URL, credentials: 'include' });

    expect(server.seen).toEqual(['include', 'include']);
  });

  it('keeps the shared request settings for an input that names no credentials', async () => {
    const server = recordingCredentials();
    const ports = browserPorts({
      http: { fetch: server.fetch, requestInit: { credentials: 'omit' } },
    });

    await readAndLocate(ports, { url: RECORDING_URL });

    expect(server.seen).toEqual(['omit', 'omit']);
  });
});
