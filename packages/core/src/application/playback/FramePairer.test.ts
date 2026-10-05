import { describe, expect, it } from 'vitest';

import type { FramePair } from '../../ports/FramePair';
import { FramePairer } from './FramePairer';
import type { DecodedFrame } from '../../ports/VideoDecoderPort';
import { seconds } from '../../shared/units/time';

interface Probe {
  readonly closed: () => boolean;
}

function frame(timestamp: number): DecodedFrame<Probe> {
  let isClosed = false;
  return {
    timestamp: seconds(timestamp),
    handle: { closed: () => isClosed },
    close: (): void => {
      isClosed = true;
    },
  };
}

describe('FramePairer', () => {
  it('emits a pair as soon as every lens has a frame for the same instant, in order', () => {
    const pairs: FramePair<Probe>[] = [];
    const pairer = new FramePairer<Probe>(2, seconds(0.001), (pair) => {
      pairs.push(pair);
    });
    pairer.push(0, frame(0));
    pairer.push(0, frame(0.5));
    expect(pairs).toHaveLength(0);
    pairer.push(1, frame(0));
    pairer.push(1, frame(0.5));
    expect(pairs.map((pair) => pair.timestamp)).toEqual([0, 0.5]);
    expect(pairs[0]?.frames).toHaveLength(2);
    expect(pairer.unpaired).toBe(0);
  });

  it.each([0, 1])(
    'drops and closes the earlier frame of lens %i when the lenses disagree beyond the tolerance',
    (orphanLens) => {
      const pairs: FramePair<Probe>[] = [];
      const pairer = new FramePairer<Probe>(2, seconds(0.001), (pair) => {
        pairs.push(pair);
      });
      const orphan = frame(0);
      pairer.push(orphanLens, orphan);
      pairer.push(orphanLens, frame(1));
      pairer.push(1 - orphanLens, frame(1));
      expect(orphan.handle.closed()).toBe(true);
      expect(pairer.unpaired).toBe(1);
      expect(pairs.map((pair) => pair.timestamp)).toEqual([1]);
    },
  );

  it('measures the media time its lenses went unpaired since their last pair', () => {
    const pairer = new FramePairer<Probe>(2, seconds(0.0001), () => {
      // pairs are irrelevant here
    });
    for (let index = 0; index < 4; index += 1) {
      pairer.push(0, frame(index * 0.1));
      pairer.push(1, frame(index * 0.1 + 0.001));
    }
    expect(pairer.unpaired).toBe(7);
    expect(pairer.unpairedSpan).toBeCloseTo(0.3, 9);
  });

  it('measures no unpaired span once a pair comes again', () => {
    const pairer = new FramePairer<Probe>(2, seconds(0.0001), () => {
      // pairs are irrelevant here
    });
    pairer.push(0, frame(0));
    pairer.push(0, frame(0.1));
    pairer.push(0, frame(0.2));
    pairer.push(1, frame(0.2));
    expect(pairer.unpaired).toBe(2);
    expect(pairer.unpairedSpan).toBe(0);
  });

  it('treats timestamps within the tolerance as one instant', () => {
    const pairs: FramePair<Probe>[] = [];
    const pairer = new FramePairer<Probe>(2, seconds(0.002), (pair) => {
      pairs.push(pair);
    });
    pairer.push(0, frame(1));
    pairer.push(1, frame(1.001));
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.timestamp).toBe(1);
  });

  it('closes everything still buffered on discard', () => {
    const pairer = new FramePairer<Probe>(2, seconds(0), () => {
      // pairs are irrelevant here
    });
    const waiting = frame(3);
    pairer.push(0, waiting);
    pairer.discardAll();
    expect(waiting.handle.closed()).toBe(true);
  });

  it('works with a single lens', () => {
    const pairs: FramePair<Probe>[] = [];
    const pairer = new FramePairer<Probe>(1, seconds(0), (pair) => {
      pairs.push(pair);
    });
    pairer.push(0, frame(0.25));
    expect(pairs.map((pair) => pair.timestamp)).toEqual([0.25]);
  });

  it('rejects a frame source index outside the configured sources instead of losing the frame', () => {
    const pairer = new FramePairer<Probe>(2, seconds(0), () => {
      // pairs are irrelevant here
    });
    expect(() => {
      pairer.push(2, frame(0));
    }).toThrow(/frame source index 2/u);
  });
});
