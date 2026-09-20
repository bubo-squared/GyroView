import { windowEndpoint } from '../bridge/Endpoint';
import { EmbedHandle } from '../bridge/EmbedHandle';
import { embedUrlFor, type EmbedOptions } from '../bridge/embedUrl';

export type { EmbedOptions } from '../bridge/embedUrl';
export type { EmbedState, LoadRequest } from '../bridge/EmbedState';
export { EmbedHandle, type EmbedEvents } from '../bridge/EmbedHandle';

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

const DEFAULT_TITLE = '360 video player';
const FRAME_PERMISSIONS = 'fullscreen; autoplay';

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
  const embedPageUrl = settings.embedPageUrl ?? defaultEmbedPageUrl();
  const iframe = createFrame(embedUrlFor(embedPageUrl, options, location.origin), settings);
  container.append(iframe);
  const frameWindow = iframe.contentWindow;
  if (!frameWindow) throw new Error('the iframe has no window; is the container in the document?');
  const frameOrigin = new URL(embedPageUrl).origin;
  const handle = new EmbedHandle(
    windowEndpoint({
      target: frameWindow,
      targetOrigin: frameOrigin,
      listenOn: globalThis as Window & typeof globalThis,
      allowedOrigins: [frameOrigin],
      expectedSource: frameWindow,
    }),
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
    throw new Error('GyroView.embed needs settings.embedPageUrl when the script is inlined');
  }
  return new URL('embed.html', SCRIPT_URL).href;
}
