import { GyroViewError } from '@gyroview/core';

import { windowEndpoint } from '../bridge/Endpoint';
import { EmbedHandle } from '../bridge/EmbedHandle';
import {
  absoluteUrl,
  embedUrlFor,
  FRAME_PERMISSIONS,
  withAbsoluteUrls,
  type EmbedOptions,
} from '../bridge/embedUrl';

export type { EmbedOptions } from '../bridge/embedUrl';
export type { EmbedState, LoadRequest } from '../bridge/EmbedState';
export { EmbedHandle } from '../bridge/EmbedHandle';
export type { EmbedEvents } from '../protocol/messages';

export interface EmbedSettings {
  /**
   * Where `embed.html` lives; default: next to this script.
   */
  readonly embedPageUrl?: string;
  /**
   * The iframe's `title` for assistive technology.
   */
  readonly title?: string;
}

/**
 * What `GyroView.embed` hands back: the frame it made and the player API over it.
 */
export interface Embedded {
  readonly iframe: HTMLIFrameElement;
  readonly handle: EmbedHandle;
  destroy(): void;
}

const DEFAULT_TITLE = '360° video player';

/**
 * The URL this script was loaded from, remembered at load time because `currentScript` is gone
 * by the time an embedder calls in.
 */
const SCRIPT_URL = (globalThis.document.currentScript as HTMLScriptElement | null)?.src;

/**
 * Puts the player in `container` as an iframe pointing at `embed.html` and returns the API
 * over it. The frame only listens to this page's origin, and this page only to the frame.
 */
export function embed(
  container: Element,
  options: EmbedOptions,
  settings: EmbedSettings = {},
): Embedded {
  const pageUrl = document.baseURI;
  const embedPageUrl = absoluteUrl(settings.embedPageUrl ?? defaultEmbedPageUrl(), pageUrl);
  const frameUrl = embedUrlFor(embedPageUrl, withAbsoluteUrls(options, pageUrl), location.origin);
  const iframe = createFrame(frameUrl, settings);
  container.append(iframe);
  ensureFrameWindow(iframe);
  const frameOrigin = new URL(embedPageUrl).origin;
  const handle = new EmbedHandle(
    windowEndpoint({
      peer: () => iframe.contentWindow,
      peerOrigin: frameOrigin,
      listenOn: globalThis as Window & typeof globalThis,
    }),
    () => document.baseURI,
  );
  return {
    iframe,
    handle,
    destroy: (): void => {
      handle.destroy();
      iframe.remove();
    },
  };
}

function ensureFrameWindow(iframe: HTMLIFrameElement): void {
  if (!iframe.contentWindow) {
    throw new GyroViewError(
      'invalid-argument',
      'the iframe has no window; is the container in the document?',
    );
  }
}

function createFrame(url: string, settings: EmbedSettings): HTMLIFrameElement {
  const iframe = document.createElement('iframe');
  iframe.src = url;
  iframe.allow = FRAME_PERMISSIONS;
  iframe.title = settings.title ?? DEFAULT_TITLE;
  iframe.style.border = '0';
  iframe.style.width = '100%';
  iframe.style.height = '100%';
  return iframe;
}

function defaultEmbedPageUrl(): string {
  if (SCRIPT_URL === undefined) {
    throw new GyroViewError(
      'invalid-argument',
      'GyroView.embed needs settings.embedPageUrl when the script is inlined',
    );
  }
  return new URL('embed.html', SCRIPT_URL).href;
}
