import type { MediaBuffer } from '../ports/MediaBuffer';

/**
 * Test double for the media buffer port: ready to resume or not as the test tells it, its
 * listeners told whenever the test says more has come.
 */
export class FakeMediaBuffer implements MediaBuffer {
  private readonly listeners = new Set<() => void>();

  public constructor(private isReady = true) {}

  public get listenerCount(): number {
    return this.listeners.size;
  }

  public isReadyToResumeAt(): boolean {
    return this.isReady;
  }

  /**
   * More has come; the buffer is ready to resume from now on or not, as `isReady` says.
   */
  public progress(isReady: boolean): void {
    this.isReady = isReady;
    for (const listener of this.listeners) listener();
  }

  public onProgress(listener: () => void): () => void {
    const own = (): void => {
      listener();
    };
    this.listeners.add(own);
    return (): void => {
      this.listeners.delete(own);
    };
  }
}
