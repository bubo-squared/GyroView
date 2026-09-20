import { BlobRandomAccessSource } from '@gyroview/adapter-blob';
import { HttpRangeSource, type HttpRangeSourceOptions } from '@gyroview/adapter-fetch';
import type { RandomAccessSource } from '@gyroview/core';

import type { SourceOpener } from './ports';
import { isUrlInput, type MediaInput } from '../PlayerSource';

/**
 * URLs are read with HTTP ranges, blobs by slicing.
 */
export class BrowserSourceOpener implements SourceOpener {
  public constructor(private readonly http: HttpRangeSourceOptions = {}) {}

  public open(input: MediaInput): RandomAccessSource {
    return isUrlInput(input)
      ? new HttpRangeSource(input.url, this.http)
      : new BlobRandomAccessSource(input.blob);
  }
}
