type Listener<Payload> = (payload: Payload) => void;

/**
 * Minimal typed observer: one payload type per event name, unsubscribe through the returned
 * function. No platform EventTarget so it works in the dependency-free core.
 *
 * Listeners are stored with their payload type erased to `never`, which every listener type is
 * assignable to; `emit` restores the type its event name guarantees.
 */
export class TypedEmitter<Events extends Record<string, unknown>> {
  private readonly listeners = new Map<keyof Events, Set<Listener<never>>>();

  public on<Name extends keyof Events>(name: Name, listener: Listener<Events[Name]>): () => void {
    const set = this.listeners.get(name) ?? new Set<Listener<never>>();
    set.add(listener);
    this.listeners.set(name, set);
    return (): void => {
      set.delete(listener);
    };
  }

  public emit<Name extends keyof Events>(name: Name, payload: Events[Name]): void {
    const listeners = this.listeners.get(name) ?? [];
    for (const listener of listeners) (listener as Listener<Events[Name]>)(payload);
  }

  public removeAll(): void {
    this.listeners.clear();
  }
}
