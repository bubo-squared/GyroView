import { reportLater } from '../errors/reportLater';

type Listener<Payload> = (payload: Payload) => void;

/**
 * Minimal typed observer: one payload type per event name, unsubscribe through the returned
 * function. No platform EventTarget so it works in the dependency-free core.
 *
 * A listener that throws, a page's among them, is reported and skipped, as `dispatchEvent`
 * does: the code that emitted, a frame loop or a load, carries on, and so do the other listeners.
 *
 * Listeners are stored with their payload type erased to `never`, which every listener type is
 * assignable to; `emit` restores the type its event name guarantees.
 */
export class TypedEmitter<Events extends object> {
  private readonly listeners = new Map<keyof Events, Set<Listener<never>>>();

  public constructor(
    private readonly reportListenerError: (error: unknown) => void = reportLater,
  ) {}

  public on<Name extends keyof Events>(name: Name, listener: Listener<Events[Name]>): () => void {
    const set = this.listeners.get(name) ?? new Set<Listener<never>>();
    set.add(listener);
    this.listeners.set(name, set);
    return (): void => {
      set.delete(listener);
    };
  }

  /**
   * The listeners there when the emit began hear it, as `dispatchEvent` delivers: one added
   * meanwhile waits for the next emit, so a listener that subscribes itself again runs once, and
   * one removed meanwhile hears no more.
   */
  public emit<Name extends keyof Events>(name: Name, payload: Events[Name]): void {
    const listeners = this.listeners.get(name);
    if (!listeners) return;
    const listening = [...listeners];
    for (const listener of listening) {
      if (!listeners.has(listener)) continue;
      try {
        (listener as Listener<Events[Name]>)(payload);
      } catch (error) {
        this.reportListenerError(error);
      }
    }
  }

  /**
   * The listeners of an event under way are dropped too, as an unsubscribe drops one: whoever
   * removed them is past hearing from them.
   */
  public removeAll(): void {
    for (const set of this.listeners.values()) set.clear();
    this.listeners.clear();
  }
}
