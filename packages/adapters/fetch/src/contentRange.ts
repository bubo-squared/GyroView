const CONTENT_RANGE = /^bytes (\d+)-(\d+)\/(\d+|\*)$/u;
const UNKNOWN_TOTAL = '*';

/**
 * What an answer's Content-Range tells: the bytes it holds, first and last inclusive, and the
 * size of the whole where the server knows it. Across origins the header reaches the page only
 * where the server exposes it.
 */
export interface ContentRange {
  readonly first: number;
  readonly last: number;
  readonly total: number | undefined;
}

export function contentRangeOf(response: Response): ContentRange | undefined {
  const match = CONTENT_RANGE.exec(response.headers.get('content-range') ?? '');
  if (!match) return undefined;
  const [, first, last, total] = match;
  return {
    first: Number(first),
    last: Number(last),
    total: total === UNKNOWN_TOTAL ? undefined : Number(total),
  };
}
