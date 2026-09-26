/**
 * Resolves with the type of the first of the given events. Every listener is removed then, or
 * once `until` resolves, so a wait that lost a race leaves nothing behind on the target.
 */
export function nextOfEvents<Type extends string>(
  target: EventTarget,
  types: readonly Type[],
  until?: Promise<void>,
): Promise<Type> {
  const controller = new AbortController();
  void until?.then(() => {
    controller.abort();
  });
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
