import type { CodecReader, ContainerCodecs } from '../ports/CodecReader';
import { GyroViewError } from '../shared/errors/GyroViewError';

type Registration = readonly [Uint8Array, ContainerCodecs];

/**
 * Test double for the codec reader port: tells the codecs a test registered for movie bytes, by
 * their content, since a file read afresh gives new bytes; any other bytes are no movie, as with
 * the real adapter.
 */
export class FakeCodecReader implements CodecReader {
  public constructor(private readonly registrations: readonly Registration[]) {}

  public read(movieBytes: Uint8Array): Promise<ContainerCodecs> {
    const found = this.registrations.find(([registered]) => isEqual(registered, movieBytes));
    return found
      ? Promise.resolve(found[1])
      : Promise.reject(
          new GyroViewError('unsupported-container', 'the bytes are no movie the fake knows'),
        );
  }
}

function isEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}
