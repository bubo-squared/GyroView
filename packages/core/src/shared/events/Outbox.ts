import type { TypedEmitter } from './TypedEmitter';

/**
 * Where events are emitted, whether at once or once a change is complete.
 */
export interface EventSink<Events extends object> {
  emit<Name extends keyof Events>(name: Name, payload: Events[Name]): void;
}

/**
 * Holds what a change announces until the change is complete, then delivers it in order. A
 * listener never runs in the middle of the change it hears, so the code making a change reads its
 * own state after announcing, never a state a listener left. A change a listener makes while it
 * hears one supersedes the older change: once the newer change announces, whatever the older one
 * still had to announce is dropped, since the newer change reports itself (ADR 0021).
 */
export class Outbox<Events extends object> implements EventSink<Events> {
  private readonly queue: (() => void)[] = [];
  private depth = 0;
  private isDelivering = false;
  /**
   * A listener's change is under way and has announced nothing yet.
   */
  private isSuperseding = false;

  public constructor(private readonly emitter: TypedEmitter<Events>) {}

  /**
   * Runs `make` as one change: what it announces goes out once the outermost change is complete.
   */
  public change<Result>(make: () => Result): Result {
    if (this.depth === 0 && this.isDelivering) this.isSuperseding = true;
    this.depth += 1;
    try {
      return make();
    } finally {
      this.depth -= 1;
      if (this.depth === 0) {
        this.isSuperseding = false;
        this.deliver();
      }
    }
  }

  public emit<Name extends keyof Events>(name: Name, payload: Events[Name]): void {
    this.post(() => {
      this.emitter.emit(name, payload);
    });
  }

  /**
   * Announces: at once outside a change, and once it is complete within one. What is announced
   * is decided when it is delivered, for an announcement that reads the state then.
   */
  public post(announce: () => void): void {
    if (this.isSuperseding) {
      this.queue.length = 0;
      this.isSuperseding = false;
    }
    this.queue.push(announce);
    if (this.depth === 0) this.deliver();
  }

  /**
   * Announcements made while delivering, by a listener, join the end of the line.
   */
  private deliver(): void {
    if (this.isDelivering) return;
    this.isDelivering = true;
    try {
      for (let next = this.queue.shift(); next; next = this.queue.shift()) next();
    } finally {
      this.isDelivering = false;
    }
  }
}
