import { describe, expect, it } from 'vitest';

import { DRAW_AT_ONCE } from './drawSchedules';

describe('DRAW_AT_ONCE', () => {
  it('draws each request at once', () => {
    let draws = 0;
    const draw = (): void => {
      draws += 1;
    };
    DRAW_AT_ONCE.request(draw);
    DRAW_AT_ONCE.request(draw);
    expect(draws).toBe(2);
  });
});
