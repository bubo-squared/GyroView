import { ByteRange } from '@gyroview/core';
import { describe, expect, it } from 'vitest';

import type { HttpFetch } from './httpRequest';
import { HttpResource } from './HttpResource';

const URL_OF_FILE = 'https://media.example/VID_20260814_132640_00_013.insv';
const FILE_SIZE = 4096;

/**
 * A clock that reads each of `times` in turn, in milliseconds.
 */
function clockReading(times: readonly number[]): () => number {
  let read = 0;
  return (): number => {
    const time = times[read] ?? times.at(-1) ?? 0;
    read += 1;
    return time;
  };
}

/**
 * A server that knows the file: its size to a HEAD, its bytes to a range.
 */
const server: HttpFetch = (_url, init) => {
  const range = /^bytes=(\d+)-(\d+)$/u.exec(new Headers(init.headers).get('range') ?? '');
  if (!range) return Promise.resolve(new Response(null, { headers: { 'Content-Length': '4096' } }));
  const [first, last] = [Number(range[1]), Number(range[2])];
  const headers = { 'Content-Range': `bytes ${first}-${last}/${FILE_SIZE}` };
  return Promise.resolve(new Response(new Uint8Array(last - first + 1), { status: 206, headers }));
};

/**
 * Reads each range's answer and lets its body go, as a reader that took what it needed.
 */
async function readRanges(resource: HttpResource, ranges: readonly ByteRange[]): Promise<void> {
  for (const range of ranges) {
    const answer = await resource.askingAgain(() => resource.rangeAnswer(range));
    await answer.body?.cancel();
  }
}

describe('HttpResource', () => {
  it('knows no wait for an answer before a request was answered', () => {
    expect(new HttpResource(URL_OF_FILE, { fetch: server }).answerWait()).toBeUndefined();
  });

  it('takes the shortest wait for a range, so a first one slowed by a new connection counts for nothing', async () => {
    const resource = new HttpResource(URL_OF_FILE, {
      fetch: server,
      now: clockReading([0, 1200, 2000, 2750]),
    });

    await readRanges(resource, [ByteRange.of(0, 10), ByteRange.of(10, 10)]);

    expect(resource.answerWait()).toBeCloseTo(0.75);
  });

  it('times no HEAD, which a server may answer without reading the file', async () => {
    const resource = new HttpResource(URL_OF_FILE, {
      fetch: server,
      now: clockReading([0, 1000, 1850]),
    });

    await resource.size();
    await readRanges(resource, [ByteRange.of(0, 10)]);

    expect(resource.answerWait()).toBeCloseTo(0.85);
  });

  it('times no refusal, which a gateway may answer at once', async () => {
    let isBusy = true;
    const resource = new HttpResource(URL_OF_FILE, {
      fetch: (url, init): Promise<Response> => {
        const answer = isBusy
          ? Promise.resolve(new Response(null, { status: 503 }))
          : server(url, init);
        isBusy = false;
        return answer;
      },
      now: clockReading([0, 1000, 1850]),
      retryDelaysMs: [0],
    });

    await readRanges(resource, [ByteRange.of(0, 10)]);

    expect(resource.answerWait()).toBeCloseTo(0.85);
  });

  it('times no request that failed', async () => {
    const resource = new HttpResource(URL_OF_FILE, {
      fetch: (): Promise<Response> => Promise.reject(new TypeError('offline')),
      now: clockReading([0, 5]),
      retryDelaysMs: [],
    });

    await expect(resource.size()).rejects.toThrow();

    expect(resource.answerWait()).toBeUndefined();
  });
});
