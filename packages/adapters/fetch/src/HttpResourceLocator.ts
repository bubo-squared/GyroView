import type { ResourceLocator } from '@gyroview/core';

import {
  discardBody,
  FIRST_BYTE_RANGE,
  plainHttpRequest,
  type HttpRequestOptions,
} from './httpRequest';

const HTTP_FORBIDDEN = 403;
const HTTP_METHOD_NOT_ALLOWED = 405;
/**
 * How a server refuses HEAD: a 405, or a 403 from a URL signed for GET alone. The first byte
 * then answers what HEAD would.
 */
const REFUSED_HEAD: ReadonlySet<number> = new Set([HTTP_METHOD_NOT_ALLOWED, HTTP_FORBIDDEN]);

/**
 * ResourceLocator over HTTP: one HEAD request, or a one-byte GET when the server refuses HEAD.
 * Every failure, including a missing CORS header, means "not available"; the file looked for is
 * optional, so nothing here throws, and no request is spent explaining a failure.
 */
export class HttpResourceLocator implements ResourceLocator {
  public constructor(private readonly options: HttpRequestOptions = {}) {}

  public async exists(url: string): Promise<boolean> {
    try {
      const head = await plainHttpRequest(url, { method: 'HEAD' }, this.options);
      discardBody(head);
      if (!REFUSED_HEAD.has(head.status)) return head.ok;
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
