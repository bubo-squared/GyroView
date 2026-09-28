import { defineGyroView } from './index';

/**
 * `@bubo-squared/gyroview/standalone`: the package as one file with Three.js and mediabunny
 * inside, for a page without a bundler, loaded by a `<script type="module">` or imported from a
 * CDN. It exports what the package does, and registers `<gyro-view>` when loaded.
 */
export * from './index';

// A page loads the standalone file to make <gyro-view> work: registering is its purpose.
// eslint-disable-next-line unicorn/no-top-level-side-effects
defineGyroView();
