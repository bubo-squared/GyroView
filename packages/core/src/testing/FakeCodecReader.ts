import type { CodecReader, ContainerCodecs } from '../ports/CodecReader';
import { GyroViewError } from '../shared/errors/GyroViewError';

/**
 * Test double for the codec reader port: tells the codecs a test registered for movie bytes (by
 * identity); any other bytes are no movie, as with the real adapter.
 */
export class FakeCodecReader implements CodecReader {
  private readonly codecsByMovie: ReadonlyMap<Uint8Array, ContainerCodecs>;

  public constructor(entries: readonly (readonly [Uint8Array, ContainerCodecs])[]) {
    this.codecsByMovie = new Map(entries);
  }

  public read(movieBytes: Uint8Array): Promise<ContainerCodecs> {
    const codecs = this.codecsByMovie.get(movieBytes);
    return codecs
      ? Promise.resolve(codecs)
      : Promise.reject(
          new GyroViewError('unsupported-container', 'the bytes are no movie the fake knows'),
        );
  }
}
