import { bindKeyboard, type KeyboardHost } from './keyboard';
import { ViewGestures } from './ViewGestures';
import type { Player } from '../player/Player';

/**
 * What a tap or a play key toggles; the player reports a refused start as its `warning`.
 */
export type PlaybackToggle = Pick<Player, 'togglePlayback'>;

export interface ViewGestureOptions {
  /**
   * Hears a tap on the surface, a press without a drag, with the kind of pointer that made it
   * (`mouse`, `touch`, `pen`). By default a tap plays or pauses, as on `<gyro-view>`.
   */
  readonly onTap?: (pointerType: string) => void;
}

export interface KeyboardOptions {
  /**
   * What F does; by default the target fills the screen through the Fullscreen API, which
   * iPhone Safari offers to video elements only.
   */
  readonly toggleFullscreen?: () => void;
}

/**
 * The gestures `<gyro-view>` answers, for an interface of a page's own around the headless
 * player: a drag looks around (or moves a zoomed picture), a pinch or a wheel turn zooms toward
 * the fingers or the pointer, a tap plays or pauses. `surface` is the canvas or an element over
 * it. Returns what removes them.
 */
export function attachViewGestures(
  surface: HTMLElement,
  player: Pick<Player, 'pan' | 'zoom' | 'canPan'> & PlaybackToggle,
  options: ViewGestureOptions = {},
): () => void {
  const onTap =
    options.onTap ??
    ((): void => {
      player.togglePlayback();
    });
  const gestures = new ViewGestures(surface, player, onTap);
  return (): void => {
    gestures.detach();
  };
}

/**
 * The keyboard shortcuts `<gyro-view>` answers, on `target`, which a page makes focusable: space
 * or K play and pause, J and L seek, S stops, the arrows look around (with Shift they seek), plus
 * and minus zoom, 0 resets the view, M mutes, F fills the screen and Escape leaves it. Returns
 * what removes them.
 */
export function attachKeyboard(
  target: HTMLElement,
  player: KeyboardHost['player'] & PlaybackToggle,
  options: KeyboardOptions = {},
): () => void {
  const isFullscreen = (): boolean => target.matches(':fullscreen');
  return bindKeyboard(target, {
    player,
    togglePlay: (): void => {
      player.togglePlayback();
    },
    toggleFullscreen:
      options.toggleFullscreen ??
      ((): void => {
        void (isFullscreen() ? document.exitFullscreen() : target.requestFullscreen());
      }),
    isFullscreen,
    exitFullscreen: (): void => {
      void document.exitFullscreen();
    },
  });
}
