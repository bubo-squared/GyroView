import { describe, expect, it } from 'vitest';

import { TypedEmitter } from './TypedEmitter';

interface Events {
  readonly greeted: string;
  readonly counted: number;
}

describe('TypedEmitter', () => {
  it('delivers payloads to listeners of the same event only', () => {
    const emitter = new TypedEmitter<Events>();
    const greetings: string[] = [];
    const counts: number[] = [];
    emitter.on('greeted', (name) => {
      greetings.push(name);
    });
    emitter.on('counted', (count) => {
      counts.push(count);
    });
    emitter.emit('greeted', 'world');
    emitter.emit('counted', 3);
    expect(greetings).toEqual(['world']);
    expect(counts).toEqual([3]);
  });

  it('unsubscribes through the returned function and clears everything on removeAll', () => {
    const emitter = new TypedEmitter<Events>();
    let calls = 0;
    const unsubscribe = emitter.on('counted', () => {
      calls += 1;
    });
    emitter.emit('counted', 1);
    unsubscribe();
    emitter.emit('counted', 2);
    emitter.on('counted', () => {
      calls += 1;
    });
    emitter.removeAll();
    emitter.emit('counted', 3);
    expect(calls).toBe(1);
  });

  it('reports a listener that throws and still reaches the others, the emitter unharmed', () => {
    const failures: unknown[] = [];
    const emitter = new TypedEmitter<Events>((error) => {
      failures.push(error);
    });
    const counts: number[] = [];
    const broken = new Error('a page listener broke');
    emitter.on('counted', () => {
      throw broken;
    });
    emitter.on('counted', (count) => {
      counts.push(count);
    });
    expect(() => {
      emitter.emit('counted', 1);
    }).not.toThrow();
    expect(counts).toEqual([1]);
    expect(failures).toEqual([broken]);
  });
});
