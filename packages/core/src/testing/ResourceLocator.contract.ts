import { describe, expect, it } from 'vitest';

import type { ResourceLocator } from '../ports/ResourceLocator';

/**
 * A locator under test with one URL that exists and one that does not.
 */
export interface LocatorUnderTest {
  readonly locator: ResourceLocator;
  readonly existing: string;
  readonly missing: string;
}

/**
 * Behaviour every ResourceLocator must exhibit, the fake and the real adapter alike: companion
 * files are optional, so a missing one is an answer, never a failure.
 */
export function describeResourceLocatorContract(setup: () => Promise<LocatorUnderTest>): void {
  describe('ResourceLocator contract', () => {
    it('answers true for a resource that exists', async () => {
      const { locator, existing } = await setup();
      await expect(locator.exists(existing)).resolves.toBe(true);
    });

    it('answers false for a resource that does not, without throwing', async () => {
      const { locator, missing } = await setup();
      await expect(locator.exists(missing)).resolves.toBe(false);
    });
  });
}
