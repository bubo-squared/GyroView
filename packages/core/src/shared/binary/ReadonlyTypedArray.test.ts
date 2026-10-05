import { describe, expect, it } from 'vitest';

import type { ReadonlyFloat64Array } from './ReadonlyTypedArray';

describe('ReadonlyFloat64Array', () => {
  it('refuses writes to its elements at compile time', () => {
    const values: ReadonlyFloat64Array = Float64Array.of(1, 2);
    const writeToValues = (): void => {
      // @ts-expect-error -- an element of a value object's array is not written from outside
      values[0] = 3;
    };
    expect(writeToValues).toBeTypeOf('function');
    expect(values[0]).toBe(1);
  });
});
