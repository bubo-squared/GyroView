import { messageOf } from '@gyroview/core';

import type { PlayerWarning } from '../player/PlayerEvents';

/**
 * Properties a page set on the element before its definition ran (a classic script ahead of the
 * module, a framework's property binding) sit on the plain element as its own; the element's
 * accessors would replace or shadow them. They are taken off as the element is built, to be set
 * again through the accessors once it is connected.
 */
export function takeEarlyProperties(
  element: HTMLElement,
  names: readonly string[],
): Map<string, unknown> {
  const early = new Map<string, unknown>();
  for (const name of names) {
    if (!Object.hasOwn(element, name)) continue;
    early.set(name, Reflect.get(element, name));
    Reflect.deleteProperty(element, name);
  }
  return early;
}

/**
 * Sets the properties taken off again, now through the element's accessors, and forgets them. A
 * value its setter refuses is a warning: the rest still apply and the element still starts.
 */
export function applyEarlyProperties(
  element: HTMLElement,
  early: Map<string, unknown>,
  warn: (warning: PlayerWarning) => void,
): void {
  const entries = [...early];
  early.clear();
  for (const [name, value] of entries) {
    try {
      Reflect.set(element, name, value);
    } catch (error) {
      warn({
        code: 'refused-property',
        message: `${name} set before the element was defined was refused: ${messageOf(error)}`,
      });
    }
  }
}
