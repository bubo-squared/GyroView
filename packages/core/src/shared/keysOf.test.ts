import { describe, expect, it } from 'vitest';

import { keysOf } from './keysOf';

describe('keysOf', () => {
  it('lists every key the record names, in its order', () => {
    expect(keysOf<'play' | 'pause'>({ play: true, pause: true })).toEqual(['play', 'pause']);
  });
});
