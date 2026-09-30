import {
  GyroViewError,
  isAbortError,
  type ByteRange,
  type RandomAccessSource,
} from '@gyroview/core';

import { HttpResource, type HttpResourceOptions } from './HttpResource';
import { passing } from './passingFailures';

export type HttpRangeSourceOptions = HttpResourceOptions;

/**
 * RandomAccessSource over HTTP: each range read whole, in one request, asked for again when it
 * fails on the way.
 */
export class HttpRangeSource implements RandomAccessSource {
  private readonly resource: HttpResource;

  /**
   * `signal` ends every request the source makes, with the host's own `requestInit` signal.
   */
  public constructor(url: string, options: HttpRangeSourceOptions = {}, signal?: AbortSignal) {
    this.resource = new HttpResource(url, options, signal);
  }

  public size(): Promise<number> {
    return this.resource.size();
  }

  public async read(range: ByteRange): Promise<Uint8Array> {
    await this.resource.ensureFits(range);
    return range.length === 0
      ? new Uint8Array()
      : this.resource.askingAgain(() => this.readOnce(range));
  }

  private async readOnce(range: ByteRange): Promise<Uint8Array> {
    const response = await this.resource.rangeAnswer(range);
    const bytes = await this.bodyOf(response, range);
    if (bytes.byteLength !== range.length) {
      throw new GyroViewError(
        'source-truncated',
        `${this.resource.url} returned ${bytes.byteLength} bytes for a ${range.length}-byte range at ${range.offset}`,
      );
    }
    return bytes;
  }

  /**
   * The bytes of a range, which a dropped connection can break off after the headers: the most
   * common way a network fails during long playback, so it is `source-unreadable` as a refused
   * request is, not a bug or a bad file, and worth another try.
   */
  private async bodyOf(response: Response, range: ByteRange): Promise<Uint8Array> {
    try {
      return new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      if (isAbortError(error)) throw error;
      throw passing(
        new GyroViewError(
          'source-unreadable',
          `${this.resource.url} broke off the ${range.length}-byte range at ${range.offset}`,
          { cause: error },
        ),
      );
    }
  }
}
