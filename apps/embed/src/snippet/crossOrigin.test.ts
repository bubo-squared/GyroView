import { afterEach, describe, expect, it } from 'vitest';
import { commands } from 'vitest/browser';

import { embed, type Embedded } from './embedSnippet';
import { waitFor } from '../test/waiting';
import recordingUrl from '../../../../test/fixtures/synthetic/x5-trailer-dual-track-64px-10fps-3s.mp4?url';

/**
 * A host name the test server answers for through a browser command: another origin to the
 * browser, so this is a genuine cross-origin embed without a second server. The frame plays a
 * recording from its own origin; fetching media across origins is the HTTP adapter's concern.
 */
const OTHER_HOST = 'gyro-view-embed.test';
const OTHER_ORIGIN = `https://${OTHER_HOST}`;

describe('embedding across origins', () => {
  const embedded: Embedded[] = [];
  const containers: HTMLElement[] = [];

  afterEach(() => {
    for (const item of embedded.splice(0)) item.destroy();
    for (const container of containers.splice(0)) container.remove();
  });

  it('drives a player in an iframe on another origin through embed.js', async () => {
    await commands.serveOtherOrigin(OTHER_HOST);
    const embedPageUrl = `${OTHER_ORIGIN}/embed.html`;
    const container = document.createElement('div');
    container.style.width = '320px';
    container.style.height = '180px';
    document.body.append(container);
    containers.push(container);

    const item = embed(
      container,
      { src: new URL(recordingUrl, OTHER_ORIGIN).href, muted: true },
      { embedPageUrl },
    );
    embedded.push(item);
    const events: string[] = [];
    for (const name of ['ready', 'play', 'pause'] as const) {
      item.handle.events.on(name, () => {
        events.push(name);
      });
    }

    await waitFor(() => events.includes('ready'), 'the frame to become ready');
    expect(item.handle.state.metadata?.model).toBe('Insta360 X5');
    await item.handle.play();
    await waitFor(() => item.handle.state.status === 'playing', 'playback in the frame');
    await item.handle.pause();
    await item.handle.lookAt(45, 0);
    const state = await item.handle.getState();
    expect(state.isPaused).toBe(true);
    expect(state.view.yaw).toBe(45);
    expect(events).toEqual(['ready', 'play', 'pause']);
  });
});
