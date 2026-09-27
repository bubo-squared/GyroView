import { afterEach, describe, expect, it } from 'vitest';

import { embed } from './embedSnippet';
import { waitFor } from '../test/waiting';
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
    // The page's own URL, resolved against the page: the frame lives elsewhere.
    expect(url.searchParams.get('src')).toBe(new URL(recordingUrl, document.baseURI).href);
    expect(url.searchParams.get('muted')).toBe('1');
    expect(url.searchParams.get('stabilization')).toBe('horizon');
    expect(url.searchParams.get('origin')).toBe(location.origin);

    embedded.destroy();
    expect(container.querySelector('iframe')).toBeNull();
    await expect(embedded.handle.play()).rejects.toMatchObject({ code: 'embed-destroyed' });
  });

  it('keeps driving the frame once the page moves it, which loads it anew', async () => {
    const container = document.createElement('div');
    const elsewhere = document.createElement('div');
    document.body.append(container, elsewhere);
    containers.push(container, elsewhere);
    const embedded = embed(
      container,
      { src: recordingUrl, muted: true },
      { embedPageUrl: EMBED_PAGE },
    );
    await embedded.handle.getState();
    const firstWindow = embedded.iframe.contentWindow;

    elsewhere.append(container);
    await waitFor(() => embedded.iframe.contentWindow !== firstWindow, 'the frame to load anew');
    await expect(embedded.handle.getState()).resolves.toMatchObject({ isMuted: true });
    embedded.destroy();
  });

  it('needs to know where the embed page is when the script has no URL', () => {
    const container = document.createElement('div');
    document.body.append(container);
    containers.push(container);
    expect(() => embed(container, { src: recordingUrl })).toThrow(/embedPageUrl/u);
  });
});
