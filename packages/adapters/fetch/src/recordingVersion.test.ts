import { describe, expect, it } from 'vitest';

import { isSameVersion, versionOf } from './recordingVersion';

const WEDNESDAY = 'Wed, 30 Sep 2026 10:00:00 GMT';
const THURSDAY = 'Thu, 01 Oct 2026 10:00:00 GMT';

function rangeAnswer(headers: Record<string, string>): Response {
  return new Response(null, { status: 206, headers });
}

describe('versionOf', () => {
  it('reads the ETag, the Last-Modified and the size a range answer tells', () => {
    const answer = rangeAnswer({
      ETag: '"v1"',
      'Last-Modified': WEDNESDAY,
      'Content-Range': 'bytes 0-9/100',
    });
    expect(versionOf(answer)).toEqual({ etag: '"v1"', lastModified: WEDNESDAY, size: 100 });
  });

  it('reads the size of a whole answer from its Content-Length', () => {
    const answer = new Response(null, { status: 200, headers: { 'Content-Length': '100' } });
    expect(versionOf(answer)).toEqual({ size: 100 });
  });

  it('knows nothing of an answer that tells nothing', () => {
    expect(versionOf(rangeAnswer({ 'Content-Range': 'bytes 0-9/*' }))).toEqual({});
  });
});

describe('isSameVersion', () => {
  it('goes by the ETag where both tell one, weak or strong', () => {
    expect(isSameVersion({ etag: '"v1"' }, { etag: 'W/"v1"', lastModified: THURSDAY })).toBe(true);
    expect(isSameVersion({ etag: '"v1"', size: 100 }, { etag: '"v2"', size: 100 })).toBe(false);
  });

  it('goes by the Last-Modified and the size where an ETag is missing', () => {
    const known = { etag: '"v1"', lastModified: WEDNESDAY, size: 100 };
    expect(isSameVersion(known, { lastModified: WEDNESDAY, size: 100 })).toBe(true);
    expect(isSameVersion(known, { lastModified: THURSDAY, size: 100 })).toBe(false);
    expect(isSameVersion(known, { lastModified: WEDNESDAY, size: 99 })).toBe(false);
  });

  it('takes what either does not tell for the same', () => {
    expect(isSameVersion({ lastModified: WEDNESDAY }, { size: 100 })).toBe(true);
    expect(isSameVersion({}, {})).toBe(true);
  });
});
