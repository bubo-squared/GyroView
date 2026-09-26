import { degrees, seconds } from '@gyroview/core';

import type { Player } from '../player/Player';

export type ShortcutCommand =
  | 'toggle-play'
  | 'stop'
  | 'seek-back'
  | 'seek-forward'
  | 'toggle-mute'
  | 'toggle-fullscreen'
  | 'reset-view'
  | 'zoom-in'
  | 'zoom-out'
  | 'look-left'
  | 'look-right'
  | 'look-up'
  | 'look-down';

/**
 * Keys as `KeyboardEvent.key` reports them. Space and K play, J and L seek, S stops, the arrows
 * look around (with Shift they seek), M mutes, F fills the screen, 0 resets the view, plus and
 * minus zoom. Escape leaves fullscreen.
 */
const PLAIN_KEYS: ReadonlyMap<string, ShortcutCommand> = new Map<string, ShortcutCommand>([
  [' ', 'toggle-play'],
  ['k', 'toggle-play'],
  ['j', 'seek-back'],
  ['l', 'seek-forward'],
  ['s', 'stop'],
  ['m', 'toggle-mute'],
  ['f', 'toggle-fullscreen'],
  ['0', 'reset-view'],
  ['+', 'zoom-in'],
  ['=', 'zoom-in'],
  ['-', 'zoom-out'],
  ['ArrowLeft', 'look-left'],
  ['ArrowRight', 'look-right'],
  ['ArrowUp', 'look-up'],
  ['ArrowDown', 'look-down'],
]);

const SHIFTED_KEYS: ReadonlyMap<string, ShortcutCommand> = new Map<string, ShortcutCommand>([
  ['ArrowLeft', 'seek-back'],
  ['ArrowRight', 'seek-forward'],
]);

export interface KeyPress {
  readonly key: string;
  readonly isShiftPressed: boolean;
  /**
   * Ctrl, Alt or Meta held: the browser's shortcut, never the player's.
   */
  readonly hasSystemModifier: boolean;
}

/**
 * The player command a key press means, or undefined when the press is not a shortcut.
 */
export function shortcutFor(press: KeyPress): ShortcutCommand | undefined {
  if (press.hasSystemModifier) return undefined;
  const key = press.key.length === 1 ? press.key.toLowerCase() : press.key;
  return press.isShiftPressed ? SHIFTED_KEYS.get(key) : PLAIN_KEYS.get(key);
}

/**
 * What the keyboard drives, and how Escape leaves fullscreen when the element fills the screen.
 */
export interface KeyboardHost {
  readonly player: Pick<
    Player,
    'currentTime' | 'seek' | 'stop' | 'turn' | 'zoom' | 'resetView' | 'isMuted' | 'setMuted'
  >;
  togglePlay(): void;
  toggleFullscreen(): void;
  readonly isFullscreen: () => boolean;
  exitFullscreen(): void;
}

type Action = (host: KeyboardHost) => void;

const SEEK_STEP_SECONDS = 5;
const LOOK_STEP_DEGREES = 5;

function seekBy(delta: number): Action {
  return ({ player }): void => {
    player.seek(seconds(player.currentTime + delta));
  };
}

function lookBy(yawDelta: number, pitchDelta: number): Action {
  return ({ player }): void => {
    player.turn(degrees(yawDelta), degrees(pitchDelta));
  };
}

/**
 * What each command does; a command without an action does not compile.
 */
const ACTIONS: Readonly<Record<ShortcutCommand, Action>> = {
  'toggle-play': (host): void => {
    host.togglePlay();
  },
  stop: ({ player }): void => {
    player.stop();
  },
  'seek-back': seekBy(-SEEK_STEP_SECONDS),
  'seek-forward': seekBy(SEEK_STEP_SECONDS),
  'toggle-mute': ({ player }): void => {
    player.setMuted(!player.isMuted);
  },
  'toggle-fullscreen': (host): void => {
    host.toggleFullscreen();
  },
  'reset-view': ({ player }): void => {
    player.resetView();
  },
  'zoom-in': ({ player }): void => {
    player.zoom(1);
  },
  'zoom-out': ({ player }): void => {
    player.zoom(-1);
  },
  'look-left': lookBy(-LOOK_STEP_DEGREES, 0),
  'look-right': lookBy(LOOK_STEP_DEGREES, 0),
  'look-up': lookBy(0, LOOK_STEP_DEGREES),
  'look-down': lookBy(0, -LOOK_STEP_DEGREES),
};

/**
 * Turns key presses on the element into player commands for as long as the element lives,
 * leaving the keys a focused control handles itself and the browser's shortcuts alone.
 */
export function bindKeyboard(element: HTMLElement, host: KeyboardHost): void {
  element.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && host.isFullscreen()) {
      host.exitFullscreen();
      return;
    }
    const command = shortcutFor({
      key: event.key,
      isShiftPressed: event.shiftKey,
      hasSystemModifier: event.ctrlKey || event.altKey || event.metaKey,
    });
    if (!command || isControlsOwnKey(event)) return;
    event.preventDefault();
    ACTIONS[command](host);
  });
}

const SLIDER_KEYS: ReadonlySet<string> = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
]);
const BUTTON_KEY = ' ';

/**
 * A slider steps with the arrows and a button presses with Space. A press from the shadow tree
 * reaches the element retargeted to it, so the control it started at is read from its path.
 */
function isControlsOwnKey(event: KeyboardEvent): boolean {
  const [origin] = event.composedPath();
  return origin instanceof HTMLInputElement
    ? SLIDER_KEYS.has(event.key)
    : origin instanceof HTMLButtonElement && event.key === BUTTON_KEY;
}
