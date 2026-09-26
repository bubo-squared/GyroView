import { describe, expect, it } from 'vitest';

import { isTrustedOrigin, originOf } from './origins';

describe('isTrustedOrigin', () => {
  it('trusts the listed origins only, and never the opaque origin, even when listed', () => {
    expect(isTrustedOrigin('https://site.example', ['https://site.example'])).toBe(true);
    expect(isTrustedOrigin('https://other.example', ['https://site.example'])).toBe(false);
    expect(isTrustedOrigin('*', ['https://site.example'])).toBe(false);
    expect(isTrustedOrigin('null', ['null'])).toBe(false);
    expect(isTrustedOrigin('', [''])).toBe(false);
  });
});

describe('originOf', () => {
  it('extracts an origin from an absolute URL and nothing from the rest', () => {
    expect(originOf('https://site.example:8443/page?x=1')).toBe('https://site.example:8443');
    expect(originOf('not a url')).toBeUndefined();
    expect(originOf('data:text/html,hi')).toBeUndefined();
  });
});
