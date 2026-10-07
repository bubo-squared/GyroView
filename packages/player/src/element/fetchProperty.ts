import { GyroViewError } from '@gyroview/core';

import type { RecordingFetch } from '../PlayerSource';

/**
 * Defines the element's `fetch` (`GyroViewElement.fetch`): it holds a page's function, or `null`
 * for the platform's own, and calls `changed` when another one takes its place. A handler written
 * on the element in markup keeps finding the global `fetch`.
 */
export function defineFetchProperty(element: HTMLElement, changed: () => void): void {
  let current: RecordingFetch | null = null;
  Object.defineProperty(element, 'fetch', {
    configurable: true,
    enumerable: true,
    get: (): RecordingFetch | null => current,
    set: (value: unknown): void => {
      const next = recordingFetchOf(value);
      if (next === current) return;
      current = next;
      changed();
    },
  });
  hideFromInlineHandlers(element, ['fetch']);
}

/**
 * The element's `fetch` from what a page set: a function as it is, `null` or `undefined` (as a
 * framework passes an unset value) for the platform's own; anything else is refused.
 */
function recordingFetchOf(value: unknown): RecordingFetch | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'function') {
    throw new GyroViewError(
      'invalid-argument',
      "fetch must be a function, or null for fetch's own",
    );
  }
  return value as RecordingFetch;
}

/**
 * An inline event handler written on the element (`onerror="fetch(…)"`) runs with the element in
 * its scope, so a bare name there finds the element's member before the global of that name.
 * The members named here are hidden from it, as the DOM hides `append` and `remove`, keeping what
 * the element already hides.
 */
function hideFromInlineHandlers(element: object, names: readonly string[]): void {
  const inherited: unknown = Reflect.get(element, Symbol.unscopables);
  const hidden: Record<string, boolean> = Object.create(
    typeof inherited === 'object' ? inherited : null,
  ) as Record<string, boolean>;
  for (const name of names) hidden[name] = true;
  Object.defineProperty(element, Symbol.unscopables, { value: hidden, configurable: true });
}
