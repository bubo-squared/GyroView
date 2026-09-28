import { describe, expect, it } from 'vitest';

import { Outbox } from './Outbox';
import { TypedEmitter } from './TypedEmitter';

function outboxOf(): Outbox<{ readonly said: string }> {
  return new Outbox(new TypedEmitter<{ readonly said: string }>());
}

describe('Outbox', () => {
  it('delivers at once outside a change, and after the outermost change within one', () => {
    const outbox = outboxOf();
    const heard: string[] = [];
    outbox.post((): void => {
      heard.push('alone');
    });
    outbox.change(() => {
      outbox.post((): void => {
        heard.push('first');
      });
      outbox.change(() => {
        outbox.post((): void => {
          heard.push('nested');
        });
      });
      heard.push('change done');
    });
    expect(heard).toEqual(['alone', 'change done', 'first', 'nested']);
  });

  it("drops what an older change still had to say once a listener's change announces", () => {
    const outbox = outboxOf();
    const heard: string[] = [];
    outbox.change(() => {
      outbox.post(() => {
        heard.push('seeking 1');
        outbox.change(() => {
          outbox.post((): void => {
            heard.push('seeking 2');
          });
        });
      });
      outbox.post((): void => {
        heard.push('landed at 1');
      });
    });
    expect(heard).toEqual(['seeking 1', 'seeking 2']);
  });

  it("keeps the older change's announcements when a listener's change announces nothing", () => {
    const outbox = outboxOf();
    const heard: string[] = [];
    outbox.change(() => {
      outbox.post(() => {
        heard.push('playing');
        outbox.change(() => {
          // Announces nothing.
        });
        outbox.post((): void => {
          heard.push('a listener said so');
        });
      });
      outbox.post((): void => {
        heard.push('time');
      });
    });
    expect(heard).toEqual(['playing', 'time', 'a listener said so']);
  });

  it('returns what the change made, and delivers even when it throws', () => {
    const outbox = outboxOf();
    const heard: string[] = [];
    expect(outbox.change(() => 42)).toBe(42);
    expect(() =>
      outbox.change(() => {
        outbox.post((): void => {
          heard.push('announced');
        });
        throw new Error('broke');
      }),
    ).toThrow('broke');
    expect(heard).toEqual(['announced']);
  });

  it('emits through the emitter it was given, after the change', () => {
    const emitter = new TypedEmitter<{ readonly said: string }>();
    const outbox = new Outbox(emitter);
    const heard: string[] = [];
    emitter.on('said', (word) => {
      heard.push(word);
    });
    outbox.change(() => {
      outbox.emit('said', 'hello');
      heard.push('change done');
    });
    expect(heard).toEqual(['change done', 'hello']);
  });
});
