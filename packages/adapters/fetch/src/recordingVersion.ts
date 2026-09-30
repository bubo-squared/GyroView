import { contentRangeOf } from './contentRange';

const HTTP_OK = 200;
const WEAK_ETAG_PREFIX = /^W\//u;

/**
 * What an answer tells of the recording's version: read from the answer itself, never asked
 * for with a conditional request, which would cost every range a CORS preflight. An `ETag`
 * reaches a page on another origin only where the server exposes it; `Last-Modified` always
 * does; the size is the Content-Range total of a range, the Content-Length of a whole answer.
 */
export interface RecordingVersion {
  readonly etag?: string;
  readonly lastModified?: string;
  readonly size?: number;
}

export function versionOf(response: Response): RecordingVersion {
  const etag = response.headers.get('etag');
  const lastModified = response.headers.get('last-modified');
  const size = sizeOf(response);
  return {
    ...(etag !== null && { etag }),
    ...(lastModified !== null && { lastModified }),
    ...(size !== undefined && { size }),
  };
}

/**
 * Whether two answers are of one version of the recording, by the ETag where both tell one,
 * else by the Last-Modified and the size; what either does not tell is taken for the same, so
 * a server that tells nothing is never taken for one that changed its file.
 */
export function isSameVersion(known: RecordingVersion, seen: RecordingVersion): boolean {
  return known.etag !== undefined && seen.etag !== undefined
    ? opaqueTagOf(known.etag) === opaqueTagOf(seen.etag)
    : isSameWhereTold(known.lastModified, seen.lastModified) &&
        isSameWhereTold(known.size, seen.size);
}

/**
 * The tag without its weakness mark: a CDN may weaken a strong ETag it passes on.
 */
function opaqueTagOf(etag: string): string {
  return etag.replace(WEAK_ETAG_PREFIX, '');
}

function isSameWhereTold<T>(known: T | undefined, seen: T | undefined): boolean {
  return known === undefined || seen === undefined || known === seen;
}

function sizeOf(response: Response): number | undefined {
  const size =
    response.status === HTTP_OK
      ? Number(response.headers.get('content-length') ?? NaN)
      : contentRangeOf(response)?.total;
  return size !== undefined && Number.isSafeInteger(size) && size > 0 ? size : undefined;
}
