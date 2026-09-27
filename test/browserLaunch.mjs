/**
 * Lets Chromium start the audio clock without a gesture; the tests exercise the player, not the
 * policy.
 */
export const AUTOPLAY_WITHOUT_GESTURE = '--autoplay-policy=no-user-gesture-required';

/**
 * Headless Chromium draws WebGL in software (SwiftShader) unless told to use the GPU, about ten
 * times slower for the rendering tests. macOS always has a GPU to ask for; elsewhere (the Linux
 * CI runners have none) the software path runs, so it stays covered.
 */
const GPU_ON_MACOS = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'];

/**
 * Chromium's command line for a browser test project, with `extra` flags of its own.
 */
export function chromiumArguments(...extra) {
  const gpu = process.platform === 'darwin' ? GPU_ON_MACOS : [];
  return [...gpu, ...extra];
}
