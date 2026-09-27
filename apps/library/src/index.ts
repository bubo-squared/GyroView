import type { GyroViewElement } from '@gyroview/player';

/**
 * The npm package: the element, the player without the element, and the types their methods and
 * events speak. The core and the adapters are bundled in; nothing else of theirs is public.
 */
export {
  createBrowserPlayer,
  defineGyroView,
  GYRO_VIEW_TAG,
  GyroViewElement,
  Player,
} from '@gyroview/player';
export type {
  BlobInput,
  BrowserPortsOptions,
  FileSource,
  ImuFrameSummary,
  LoadOptions,
  MediaInput,
  PipelineHost,
  PlayerEvents,
  PlayerMetadata,
  PlayerSource,
  PlayerStatus,
  SoundLevel,
  UrlInput,
} from '@gyroview/player';
export {
  GyroViewError,
  hasErrorCode,
  STABILIZATION_MODES,
  VIEW_MODES,
  type GyroViewErrorCode,
  type StabilizationMode,
  type ViewMode,
  type ViewState,
} from '@gyroview/core';

declare global {
  interface HTMLElementTagNameMap {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- the key is the tag name, as in the DOM's own map
    'gyro-view': GyroViewElement;
  }
}
