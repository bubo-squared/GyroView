/**
 * Resolves with the type of the first of the given events; the other listeners are removed then.
 */
export function nextOfEvents<Type extends string>(
  target: EventTarget,
  types: readonly Type[],
): Promise<Type> {
  const controller = new AbortController();
  return new Promise((resolve) => {
    for (const type of types) {
      target.addEventListener(
        type,
        () => {
          controller.abort();
          resolve(type);
        },
        { once: true, signal: controller.signal },
      );
    }
  });
}
