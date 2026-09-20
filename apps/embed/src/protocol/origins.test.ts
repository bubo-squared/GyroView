import { describe, expect, it } from 'vitest';

import { ANY_ORIGIN, isTrustedOrigin, originOf } from './origins';

describe('isTrustedOrigin', () => {
  it('trusts listed origins and the wildcard, never the opaque origin', () => {
    expect(isTrustedOrigin('https://site.example', ['https://site.example'])).toBe(true);
    expect(isTrustedOrigin('https://other.example', ['https://site.example'])).toBe(false);
    expect(isTrustedOrigin('https://other.example', [ANY_ORIGIN])).toBe(true);
    expect(isTrustedOrigin('null', [ANY_ORIGIN])).toBe(false);
    expect(isTrustedOrigin('', [ANY_ORIGIN])).toBe(false);
  });
});

describe('originOf', () => {
  it('extracts an origin from an absolute URL and nothing from the rest', () => {
    expect(originOf('https://site.example:8443/page?x=1')).toBe('https://site.example:8443');
    expect(originOf('not a url')).toBeUndefined();
    expect(originOf('data:text/html,hi')).toBeUndefined();
  });
});
