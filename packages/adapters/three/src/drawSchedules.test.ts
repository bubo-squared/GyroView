import { describe, expect, it } from 'vitest';

import { DRAW_AT_ONCE, DRAW_WITH_NEXT_PAIR } from './drawSchedules';

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

describe('DRAW_WITH_NEXT_PAIR', () => {
  it('draws no request, leaving each change to the next presented pair', () => {
    let draws = 0;
    DRAW_WITH_NEXT_PAIR.request(() => {
      draws += 1;
    });
    expect(draws).toBe(0);
  });
});
