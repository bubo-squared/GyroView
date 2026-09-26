import { describeResourceLocatorContract } from '@gyroview/core/testing';
import { afterAll, describe, expect, it } from 'vitest';

import { HttpResourceLocator } from './HttpResourceLocator';
import { TestServer } from './testServer';

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

const HTTP_NOT_FOUND = 404;

describeResourceLocatorContract(async () => {
  const existing = await serve();
  const missing = await serve({ failsWith: HTTP_NOT_FOUND });
  return { locator: new HttpResourceLocator(), existing: existing.url, missing: missing.url };
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

  it('falls back to a one-byte GET when HEAD is not allowed', async () => {
    const server = await serve({ answersHeadWith: 405 });
    await expect(new HttpResourceLocator().exists(server.url)).resolves.toBe(true);
  });

  it('answers false instead of throwing when the server is unreachable', async () => {
    const server = await serve();
    await server.stop();
    servers.pop();
    await expect(new HttpResourceLocator().exists(server.url)).resolves.toBe(false);
  });
});
