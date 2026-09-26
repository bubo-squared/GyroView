import { describe, expect, it } from 'vitest';

import { choiceOf, stabilizationModeOf, viewModeOf } from './choices';

describe('choices', () => {
  it('matches a choice without regard to case or surrounding space', () => {
    expect(stabilizationModeOf('Horizon')).toBe('horizon');
    expect(viewModeOf(' Equirectangular ')).toBe('equirectangular');
    expect(viewModeOf('RAW-LENSES')).toBe('raw-lenses');
  });

  it('knows nothing of an absent or unknown value', () => {
    expect(stabilizationModeOf('wobble')).toBeUndefined();
    expect(viewModeOf('stereographic')).toBeUndefined();
    expect(choiceOf(null, ['a'])).toBeUndefined();
  });
});
