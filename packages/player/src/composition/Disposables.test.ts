import { describe, expect, it } from 'vitest';

import { Disposables } from './Disposables';

describe('Disposables', () => {
  it('disposes in reverse order, once', () => {
    const order: string[] = [];
    const disposables = new Disposables();
    disposables.add(() => {
      order.push('first');
    });
    disposables.add(() => {
      order.push('second');
    });

    disposables.disposeAll();
    disposables.disposeAll();

    expect(order).toEqual(['second', 'first']);
  });

  it('disposes at once anything added after disposal', () => {
    const disposables = new Disposables();
    disposables.disposeAll();
    let isDisposed = false;
    disposables.add(() => {
      isDisposed = true;
    });
    expect(isDisposed).toBe(true);
  });

  it('hands the collection over as one idempotent disposer', () => {
    let count = 0;
    const disposables = new Disposables();
    disposables.add(() => {
      count += 1;
    });
    const dispose = disposables.toDisposer();
    dispose();
    dispose();
    expect(count).toBe(1);
  });
});
