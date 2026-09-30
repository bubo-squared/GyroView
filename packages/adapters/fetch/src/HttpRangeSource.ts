import { isAbortError, type ByteRange, type RandomAccessSource } from '@gyroview/core';

import { HttpResource, type HttpResourceOptions } from './HttpResource';
import { brokenOff, truncated } from './rangeFailures';

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
      throw truncated(this.resource.url, bytes.byteLength, range);
    }
    return bytes;
  }

  private async bodyOf(response: Response, range: ByteRange): Promise<Uint8Array> {
    try {
      return new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      if (isAbortError(error)) throw error;
      throw brokenOff(this.resource.url, range, error);
    }
  }
}
