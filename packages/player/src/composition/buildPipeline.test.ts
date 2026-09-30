import { afterEach, describe, expect, it } from 'vitest';

import { browserPorts } from './browserPorts';
import { buildPipeline } from './buildPipeline';
import { openRecording } from './openRecording';
import { X5_RECORDING_WITH_AUDIO_URL } from '../test/recordings';

describe('buildPipeline', () => {
  const hosts: HTMLElement[] = [];

  afterEach(() => {
    for (const element of hosts.splice(0)) element.remove();
  });

  it('builds nothing on the host for a load a newer one has superseded', async () => {
    const ports = browserPorts();
    const opened = await openRecording(
      { main: { url: X5_RECORDING_WITH_AUDIO_URL }, second: undefined },
      ports,
      new AbortController().signal,
    );
    const canvas = document.createElement('canvas');
    const audio = document.createElement('audio');
    hosts.push(canvas, audio);
    const sourceChanges: MutationRecord[] = [];
    const observer = new MutationObserver((records) => {
      sourceChanges.push(...records);
    });
    observer.observe(audio, { attributeFilter: ['src'] });
    const superseded = new AbortController();
    superseded.abort();

    await expect(
      buildPipeline({
        opened,
        host: { canvas, audio },
        decoderPort: ports.decoderPort,
        signal: superseded.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });

    // The audio element the host shares with every load was never given a source, not even for a
    // moment, and the canvas has no GL context, so it still offers a 2D one.
    sourceChanges.push(...observer.takeRecords());
    observer.disconnect();
    expect(sourceChanges).toEqual([]);
    expect(canvas.getContext('2d')).not.toBeNull();
    opened.dispose();
  });

  it('lets the downloads read ahead once playing starts, and not before', async () => {
    const ports = browserPorts();
    const opened = await openRecording(
      { main: { url: X5_RECORDING_WITH_AUDIO_URL }, second: undefined },
      ports,
      new AbortController().signal,
    );
    const canvas = document.createElement('canvas');
    const audio = document.createElement('audio');
    audio.muted = true;
    hosts.push(canvas, audio);
    let readsAhead = 0;
    const readAhead = (): void => {
      readsAhead += 1;
      opened.readAhead();
    };
    const pipeline = await buildPipeline({
      opened: { ...opened, readAhead },
      host: { canvas, audio },
      decoderPort: ports.decoderPort,
      signal: new AbortController().signal,
    });
    expect(readsAhead).toBe(0);

    await pipeline.session.play();

    expect(readsAhead).toBeGreaterThan(0);
    pipeline.dispose();
    opened.dispose();
  });
});
