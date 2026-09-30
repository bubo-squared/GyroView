import type { MediaBuffer } from '../../ports/MediaBuffer';
import type { Seconds } from '../../shared/units/time';

/**
 * A recording's buffer, over the downloads of its files (ADR 0011): ready to resume once every
 * file is, since the picture of a split pair needs both lenses.
 */
export class RecordingBuffer implements MediaBuffer {
  public constructor(private readonly files: readonly MediaBuffer[]) {}

  public isReadyToResumeAt(time: Seconds): boolean {
    return this.files.every((file) => file.isReadyToResumeAt(time));
  }

  public onProgress(listener: () => void): () => void {
    const stops = this.files.map((file) => file.onProgress(listener));
    return (): void => {
      for (const stop of stops) stop();
    };
  }
}
