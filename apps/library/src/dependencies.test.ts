import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

interface Manifest {
  readonly dependencies?: Record<string, string>;
}

const WORKSPACE = 'workspace:';
const ADAPTER_SCOPE = '@gyroview/adapter-';

function manifestAt(path: string): Manifest {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as Manifest;
}

/**
 * The libraries from npm that the adapters the player composes are built against.
 */
function thirdPartyOfTheAdapters(): Record<string, string> {
  const adapters = Object.keys(
    manifestAt('../../../packages/player/package.json').dependencies ?? {},
  )
    .filter((name) => name.startsWith(ADAPTER_SCOPE))
    .map((name) => name.slice(ADAPTER_SCOPE.length));
  const ranges = adapters.flatMap((adapter) =>
    Object.entries(
      manifestAt(`../../../packages/adapters/${adapter}/package.json`).dependencies ?? {},
    ),
  );
  return Object.fromEntries(ranges.filter(([, range]) => !range.startsWith(WORKSPACE)));
}

describe('the npm package manifest', () => {
  it('depends on the libraries the bundled adapters are built against, at their versions', () => {
    expect(manifestAt('../package.json').dependencies).toEqual(thirdPartyOfTheAdapters());
  });
});
