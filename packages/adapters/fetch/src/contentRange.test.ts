import { describe, expect, it } from 'vitest';

import { contentRangeOf } from './contentRange';

function answerWith(contentRange?: string): Response {
  return new Response(null, {
    status: 206,
    headers: contentRange === undefined ? {} : { 'Content-Range': contentRange },
  });
}

describe('contentRangeOf', () => {
  it('reads the bytes an answer holds and the size of the whole', () => {
    expect(contentRangeOf(answerWith('bytes 10-19/100'))).toEqual({
      first: 10,
      last: 19,
      total: 100,
    });
  });

  it('reads no size where the server does not know it', () => {
    expect(contentRangeOf(answerWith('bytes 10-19/*'))).toEqual({
      first: 10,
      last: 19,
      total: undefined,
    });
  });

  it('reads nothing of a header that is missing, hidden or not of bytes', () => {
    expect(contentRangeOf(answerWith())).toBeUndefined();
    expect(contentRangeOf(answerWith('items 10-19/100'))).toBeUndefined();
  });
});
