import type { ProtocolMessage } from '../protocol/messages';

/**
 * A display frame at 60 Hz: a page shows no more of a stream of view changes than one a frame.
 */
const FRAME_INTERVAL_MS = 16;

/**
 * Sends a stream of messages of which only the latest matters, such as the view while the device
 * turns it or a fast pointer drags it, at most once a frame: the first at once, then the latest
 * of those that came within the frame. A held message goes out before any other (`flush`), so the
 * page never hears a command's result before the view change it caused. Timers rather than
 * animation frames: a frame scrolled out of sight gets none, and its view would never be sent.
 */
export class OncePerFrame {
  private held: ProtocolMessage | undefined;
  private lastSentAt = -Infinity;
  private timer: ReturnType<typeof setTimeout> | undefined;

  public constructor(private readonly deliver: (message: ProtocolMessage) => void) {}

  public offer(message: ProtocolMessage): void {
    const wait = this.lastSentAt + FRAME_INTERVAL_MS - performance.now();
    if (wait <= 0 && !this.held) {
      this.send(message);
      return;
    }
    this.held = message;
    this.timer ??= setTimeout(
      () => {
        this.flush();
      },
      Math.max(wait, 0),
    );
  }

  /**
   * Sends the message held, if any, now.
   */
  public flush(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    const { held } = this;
    this.held = undefined;
    if (held) this.send(held);
  }

  /**
   * Drops the message held: the page no longer listens.
   */
  public dispose(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.held = undefined;
  }

  private send(message: ProtocolMessage): void {
    this.lastSentAt = performance.now();
    this.deliver(message);
  }
}
