import { describe, expect, it } from 'vitest';

import { SampleCursor, type CursorHost } from './SampleCursor';
import type { TrackSampleTable } from '../../domain/container/TrackSampleTable';
import type { ByteRange } from '../../shared/binary/ByteRange';
import { cameraRecording } from '../../testing/cameraRecording';
import { settle } from '../../../test/support/settle';

const TRACK: TrackSampleTable = cameraRecording({
  frames: 3,
  frameBytes: 4,
  soundBytes: 2,
  frameRate: 10,
  framesPerGop: 1,
}).lens0;

/**
 * A download as far as a cursor sees it: the samples whose bytes came, the ranges that failed,
 * and what the cursor told it.
 */
class FakeHost implements CursorHost {
  public changes = 0;
  public closings = 0;
  private readonly came = new Map<number, Uint8Array>();
  private failed: { readonly range: ByteRange; readonly error: Error } | undefined;

  public bring(sample: number): void {
    this.came.set(TRACK.rangeOf(sample).offset, Uint8Array.of(sample));
  }

  public failAt(sample: number, error: Error): ByteRange {
    const range = TRACK.rangeOf(sample);
    this.failed = { range, error };
    return range;
  }

  public bytesOf(range: ByteRange): Uint8Array | undefined {
    return this.came.get(range.offset);
  }

  public failureOf(range: ByteRange): Error | undefined {
    return this.failed?.range.overlaps(range) === true ? this.failed.error : undefined;
  }

  public changed(): void {
    this.changes += 1;
  }

  public closed(): void {
    this.closings += 1;
  }
}

function cursorAt(sample: number, host = new FakeHost()): { cursor: SampleCursor; host: FakeHost } {
  return { cursor: new SampleCursor(TRACK, sample, host), host };
}

describe('SampleCursor', () => {
  it('hands out a sample whose bytes have come at once, and tells it moved on', async () => {
    const { cursor, host } = cursorAt(1);
    host.bring(1);
    await expect(cursor.nextSample()).resolves.toMatchObject({
      sample: 1,
      bytes: Uint8Array.of(1),
    });
    expect(cursor.position).toBe(2);
    expect(host.changes).toBe(1);
  });

  it('waits for bytes still to come, telling so, and hands the sample out once they have', async () => {
    const { cursor, host } = cursorAt(0);
    expect(cursor.isWaiting).toBe(false);
    const next = cursor.nextSample();
    expect([cursor.isWaiting, host.changes]).toEqual([true, 1]);
    host.bring(1);
    cursor.serve();
    expect(cursor.isWaiting).toBe(true);
    host.bring(0);
    cursor.serve();
    await expect(next).resolves.toMatchObject({ sample: 0 });
    expect(cursor.isWaiting).toBe(false);
  });

  it('reads one sample at a time', () => {
    const { cursor } = cursorAt(0);
    void cursor.nextSample();
    expect(() => cursor.nextSample()).toThrow('a cursor reads one sample at a time');
  });

  it('fails a read of a range that failed at once', async () => {
    const { cursor, host } = cursorAt(0);
    const error = new Error('the connection dropped');
    host.failAt(0, error);
    await expect(cursor.nextSample()).rejects.toBe(error);
  });

  it('fails the awaited read when its range fails, and not for another range', async () => {
    const { cursor, host } = cursorAt(1);
    const error = new Error('the connection dropped');
    const failed = expect(cursor.nextSample()).rejects.toBe(error);
    cursor.fail(TRACK.rangeOf(0), error);
    cursor.fail(TRACK.rangeOf(2), error);
    expect(cursor.isWaiting).toBe(true);
    cursor.fail(host.failAt(1, error), error);
    await failed;
  });

  it('is not failed while it awaits nothing', async () => {
    const { cursor, host } = cursorAt(0);
    cursor.fail(TRACK.rangeOf(0), new Error('the connection dropped'));
    host.bring(0);
    await expect(cursor.nextSample()).resolves.toMatchObject({ sample: 0 });
  });

  it('ends at its track’s end', async () => {
    const { cursor } = cursorAt(TRACK.sampleCount);
    await expect(cursor.nextSample()).resolves.toBeUndefined();
  });

  it('once closed, ends the awaited read and every later one, and tells it closed once', async () => {
    const { cursor, host } = cursorAt(0);
    const next = cursor.nextSample();
    cursor.close();
    cursor.close();
    await expect(next).resolves.toBeUndefined();
    host.bring(0);
    await expect(cursor.nextSample()).resolves.toBeUndefined();
    await settle();
    expect(host.closings).toBe(1);
  });
});
