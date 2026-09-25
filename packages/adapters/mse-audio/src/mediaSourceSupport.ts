import { GyroViewError } from '@gyroview/core';

/**
 * Safari 17+ ships ManagedMediaSource, the only media source on iPhone, and TypeScript's DOM
 * declarations do not know it yet. It has the MediaSource surface this adapter uses.
 */
interface MediaSourceConstructor {
  new (): MediaSource;
  isTypeSupported(type: string): boolean;
}

const MANAGED_MEDIA_SOURCE = 'ManagedMediaSource';
const MEDIA_SOURCE = 'MediaSource';

function isMediaSourceConstructor(value: unknown): value is MediaSourceConstructor {
  return (
    typeof value === 'function' &&
    typeof (value as Partial<MediaSourceConstructor>).isTypeSupported === 'function'
  );
}

function globalConstructor(name: string): MediaSourceConstructor | undefined {
  const value: unknown = Reflect.get(globalThis, name);
  return isMediaSourceConstructor(value) ? value : undefined;
}

/**
 * The media source implementation to use, preferring the managed one where it exists.
 */
export function mediaSourceConstructor(): MediaSourceConstructor | undefined {
  return globalConstructor(MANAGED_MEDIA_SOURCE) ?? globalConstructor(MEDIA_SOURCE);
}

export function isMediaSourceTypeSupported(mimeType: string): boolean {
  return mediaSourceConstructor()?.isTypeSupported(mimeType) ?? false;
}

export interface AttachedMediaSource {
  readonly mediaSource: MediaSource;
  /**
   * Detaches the media source from the element and frees the object URL.
   */
  readonly detach: () => void;
}

/**
 * `sourceopen` follows the attachment within a task or two; a browser that never sends it, or
 * sends the element's `error` instead, must not hold the load, which falls back to a silent clock.
 */
const SOURCE_OPEN_TIMEOUT_MS = 10_000;

/**
 * Attaches a fresh media source to the element and resolves once it is open for source buffers;
 * rejects with `decode`, detached again, when the element fails or the source never opens.
 */
export async function attachMediaSource(
  element: HTMLMediaElement,
  mediaSourceClass: MediaSourceConstructor,
): Promise<AttachedMediaSource> {
  const mediaSource = new mediaSourceClass();
  const outcome = sourceOpenOutcome(element, mediaSource);
  const url = URL.createObjectURL(mediaSource);
  element.disableRemotePlayback = true;
  element.src = url;
  const attached = {
    mediaSource,
    detach: (): void => {
      element.removeAttribute('src');
      element.load();
      URL.revokeObjectURL(url);
    },
  };
  const opened = await outcome;
  if (opened !== 'sourceopen') {
    attached.detach();
    throw new GyroViewError(
      'decode',
      `the audio element could not open its media source (${opened})`,
    );
  }
  return attached;
}

function sourceOpenOutcome(
  element: HTMLMediaElement,
  mediaSource: MediaSource,
): Promise<'sourceopen' | 'error' | 'timeout'> {
  const opened = nextOfEvents(mediaSource, ['sourceopen'] as const);
  const failed = nextOfEvents(element, ['error'] as const);
  const timedOut = new Promise<'timeout'>((resolve) => {
    setTimeout(() => {
      resolve('timeout');
    }, SOURCE_OPEN_TIMEOUT_MS);
  });
  return Promise.race([opened, failed, timedOut]);
}

export function nextEvent(target: EventTarget, type: string): Promise<void> {
  return new Promise((resolve) => {
    target.addEventListener(
      type,
      () => {
        resolve();
      },
      { once: true },
    );
  });
}

/**
 * Resolves with the type of the first of the given events; the other listeners are removed then.
 */
export function nextOfEvents<Type extends string>(
  target: EventTarget,
  types: readonly Type[],
): Promise<Type> {
  const controller = new AbortController();
  return new Promise((resolve) => {
    for (const type of types) {
      target.addEventListener(
        type,
        () => {
          controller.abort();
          resolve(type);
        },
        { once: true, signal: controller.signal },
      );
    }
  });
}
