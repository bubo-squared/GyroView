import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OncePerFrame } from './OncePerFrame';
import { eventMessage, helloMessage, type ProtocolMessage } from '../protocol/messages';

function viewAt(yaw: number): ProtocolMessage {
  return eventMessage('viewchange', { yaw, pitch: 0, fieldOfView: 90 });
}

describe('OncePerFrame', () => {
  let sent: ProtocolMessage[] = [];
  let views: OncePerFrame;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    sent = [];
    views = new OncePerFrame((message) => {
      sent.push(message);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends the first at once, then the latest of each frame', () => {
    views.offer(viewAt(1));
    views.offer(viewAt(2));
    views.offer(viewAt(3));
    expect(sent).toEqual([viewAt(1)]);
    vi.advanceTimersByTime(16);
    expect(sent).toEqual([viewAt(1), viewAt(3)]);
    vi.advanceTimersByTime(100);
    views.offer(viewAt(4));
    expect(sent).toEqual([viewAt(1), viewAt(3), viewAt(4)]);
  });

  it('sends what it holds before another message goes out', () => {
    views.offer(viewAt(1));
    views.offer(viewAt(2));
    views.flush();
    sent.push(helloMessage({}));
    vi.advanceTimersByTime(16);
    expect(sent).toEqual([viewAt(1), viewAt(2), helloMessage({})]);
  });

  it('drops what it holds once disposed', () => {
    views.offer(viewAt(1));
    views.offer(viewAt(2));
    views.dispose();
    vi.advanceTimersByTime(16);
    expect(sent).toEqual([viewAt(1)]);
  });
});
