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
