import { describe, expect, it } from 'vitest';

import { RecordingBuffer } from './RecordingBuffer';
import { seconds } from '../../shared/units/time';
import { FakeMediaBuffer } from '../../testing/FakeMediaBuffer';
import { describeMediaBufferContract } from '../../testing/MediaBuffer.contract';

describeMediaBufferContract('recording of two files', () => {
  const files = [new FakeMediaBuffer(false), new FakeMediaBuffer(false)];
  return Promise.resolve({
    buffer: new RecordingBuffer(files),
    bringMore: (): Promise<void> => {
      files[1]?.progress(false);
      return Promise.resolve();
    },
  });
});

describe('RecordingBuffer', () => {
  it('is ready to resume once every file of the recording is', () => {
    const [first, second] = [new FakeMediaBuffer(true), new FakeMediaBuffer(false)];
    const buffer = new RecordingBuffer([first, second]);
    expect(buffer.isReadyToResumeAt(seconds(1))).toBe(false);
    second.progress(true);
    expect(buffer.isReadyToResumeAt(seconds(1))).toBe(true);
  });

  it("tells its listener of every file's progress, until it stops listening to them all", () => {
    const files = [new FakeMediaBuffer(false), new FakeMediaBuffer(false)];
    let progress = 0;
    const stop = new RecordingBuffer(files).onProgress(() => {
      progress += 1;
    });
    for (const file of files) file.progress(false);
    stop();
    for (const file of files) file.progress(true);
    expect(progress).toBe(2);
    expect(files.map((file) => file.listenerCount)).toEqual([0, 0]);
  });
});
