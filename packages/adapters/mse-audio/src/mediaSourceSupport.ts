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
 * Attaches a fresh media source to the element and resolves once it is open for source buffers.
 */
export async function attachMediaSource(
  element: HTMLMediaElement,
  mediaSourceClass: MediaSourceConstructor,
): Promise<AttachedMediaSource> {
  const mediaSource = new mediaSourceClass();
  const opened = nextEvent(mediaSource, 'sourceopen');
  const url = URL.createObjectURL(mediaSource);
  element.disableRemotePlayback = true;
  element.src = url;
  await opened;
  return {
    mediaSource,
    detach: (): void => {
      element.removeAttribute('src');
      element.load();
      URL.revokeObjectURL(url);
    },
  };
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
