/**
 * What a fetch in front of the test server was asked: how many HEAD requests, and how many GETs.
 */
export interface AskedCount {
  readonly heads: number;
  readonly gets: number;
}

export interface AnsweringHeads {
  readonly fetch: typeof fetch;
  readonly asked: () => AskedCount;
}

/**
 * A fetch that answers the first HEAD requests with `statuses`, one each, and passes the rest on
 * to `passOn`.
 */
export function headsAnswered(
  statuses: readonly number[],
  passOn: typeof fetch = fetch,
): AnsweringHeads {
  let heads = 0;
  let gets = 0;
  return {
    asked: (): AskedCount => ({ heads, gets }),
    fetch: (input, init): Promise<Response> => {
      if (init?.method !== 'HEAD') {
        gets += 1;
        return passOn(input, init);
      }
      const status = statuses[heads];
      heads += 1;
      return status === undefined
        ? passOn(input, init)
        : Promise.resolve(new Response(null, { status }));
    },
  };
}
