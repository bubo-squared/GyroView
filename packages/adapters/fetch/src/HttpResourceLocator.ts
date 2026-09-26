import type { ResourceLocator } from '@gyroview/core';

import {
  discardBody,
  FIRST_BYTE_RANGE,
  plainHttpRequest,
  type HttpRequestOptions,
} from './httpRequest';

const HTTP_METHOD_NOT_ALLOWED = 405;

/**
 * ResourceLocator over HTTP: one HEAD request, or a one-byte GET when the server does not allow
 * HEAD. Every failure, including a missing CORS header, means "not available"; companion files
 * are optional, so nothing here throws, and no request is spent explaining a failure.
 */
export class HttpResourceLocator implements ResourceLocator {
  public constructor(private readonly options: HttpRequestOptions = {}) {}

  public async exists(url: string): Promise<boolean> {
    try {
      const head = await plainHttpRequest(url, { method: 'HEAD' }, this.options);
      discardBody(head);
      if (head.status !== HTTP_METHOD_NOT_ALLOWED) return head.ok;
      const firstByte = await plainHttpRequest(
        url,
        { method: 'GET', headers: { Range: FIRST_BYTE_RANGE } },
        this.options,
      );
      discardBody(firstByte);
      return firstByte.ok;
    } catch {
      return false;
    }
  }
}
