import { defineGyroView } from '@gyroview/player';

/**
 * What a page may import from gyro-view.js: the element, and the player without the element as
 * `createBrowserPlayer` composes it.
 */
export {
  createBrowserPlayer,
  defineGyroView,
  GYRO_VIEW_TAG,
  GyroViewElement,
  Player,
} from '@gyroview/player';

// gyro-view.js exists to make <gyro-view> work by loading it; registering is its purpose.
// eslint-disable-next-line unicorn/no-top-level-side-effects
defineGyroView();
