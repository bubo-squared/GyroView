export * from '@gyroview/player';
import { defineGyroView } from '@gyroview/player';

// gyro-view.js exists to make <gyro-view> work by loading it; registering is its purpose.
// eslint-disable-next-line unicorn/no-top-level-side-effects
defineGyroView();
