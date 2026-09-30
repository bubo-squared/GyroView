import { describeMediaBufferContract } from './MediaBuffer.contract';
import { FakeMediaBuffer } from './FakeMediaBuffer';

describeMediaBufferContract('fake', () => {
  const buffer = new FakeMediaBuffer(false);
  return Promise.resolve({
    buffer,
    bringMore: (): Promise<void> => {
      buffer.progress(false);
      return Promise.resolve();
    },
  });
});
