import { afterEach, describe, expect, it } from 'vitest';

import { embed } from './embedSnippet';
import recordingUrl from '../../../../test/fixtures/synthetic/x5-trailer-dual-track-64px-10fps-3s.mp4?url';

const EMBED_PAGE = `${location.origin}/embed.html`;

describe('GyroView.embed', () => {
  const containers: HTMLElement[] = [];

  afterEach(() => {
    for (const container of containers.splice(0)) container.remove();
  });

  it('adds an iframe pointing at the embed page with the options and this origin', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    containers.push(container);

    const embedded = embed(
      container,
      { src: recordingUrl, muted: true, stabilization: 'horizon' },
      { embedPageUrl: EMBED_PAGE, title: 'Sailing' },
    );

    const frame = container.querySelector('iframe');
    expect(frame).toBe(embedded.iframe);
    expect(frame?.allow).toBe('fullscreen; autoplay');
    expect(frame?.title).toBe('Sailing');
    const url = new URL(frame?.src ?? '');
    expect(`${url.origin}${url.pathname}`).toBe(EMBED_PAGE);
    expect(url.searchParams.get('src')).toBe(recordingUrl);
    expect(url.searchParams.get('muted')).toBe('1');
    expect(url.searchParams.get('stabilization')).toBe('horizon');
    expect(url.searchParams.get('origin')).toBe(location.origin);

    embedded.destroy();
    expect(container.querySelector('iframe')).toBeNull();
    await expect(embedded.handle.play()).rejects.toMatchObject({
      message: 'the embed was destroyed',
    });
  });

  it('needs to know where the embed page is when the script has no URL', () => {
    const container = document.createElement('div');
    document.body.append(container);
    containers.push(container);
    expect(() => embed(container, { src: recordingUrl })).toThrow(/embedPageUrl/u);
  });
});
