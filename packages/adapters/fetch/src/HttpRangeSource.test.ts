import { ByteRange } from '@gyroview/core';
import { describeRandomAccessSourceContract } from '@gyroview/core/testing';
import { afterAll, describe, expect, it } from 'vitest';

import { HttpRangeSource } from './HttpRangeSource';
import { TestServer } from './testServer';

const servers: TestServer[] = [];

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

  it('falls back to a one-byte range when the server refuses HEAD', async () => {
    const server = await serve(content, { refusesHead: true });
    await expect(new HttpRangeSource(server.url).size()).resolves.toBe(5000);
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
