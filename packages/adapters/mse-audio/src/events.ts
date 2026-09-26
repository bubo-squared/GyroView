/**
 * Resolves with the type of the first of the given events. Every listener is removed then, or as
 * soon as `cancel` aborts, so a wait that lost a race leaves nothing on the target; the watch on
 * `cancel` goes with them, so a long-lived signal gathers nothing either.
 */
export function nextOfEvents<Type extends string>(
  target: EventTarget,
  types: readonly Type[],
  cancel?: AbortSignal,
): Promise<Type> {
  const listening = new AbortController();
  cancel?.addEventListener(
    'abort',
    () => {
      listening.abort();
    },
    { once: true, signal: listening.signal },
  );
  return new Promise((resolve) => {
    for (const type of types) {
      target.addEventListener(
        type,
        () => {
          listening.abort();
          resolve(type);
        },
        { once: true, signal: listening.signal },
      );
    }
  });
}
