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

/**
 * The range a page may resolve a library to: from the version the adapters are built against up
 * to its next breaking release. For a 0.x version, as Three.js's, that is its patches only.
 */
function caretRangeOf(range: string): string {
  return range.startsWith('^') ? range : `^${range}`;
}

describe('the npm package manifest', () => {
  it('depends on the libraries the bundled adapters are built against, up to a breaking release', () => {
    const expected = Object.fromEntries(
      Object.entries(thirdPartyOfTheAdapters()).map(([name, range]) => [name, caretRangeOf(range)]),
    );
    expect(manifestAt('../package.json').dependencies).toEqual(expected);
  });
});
