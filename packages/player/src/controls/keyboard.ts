import type { ControlsHost } from './ControlsHost';
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
 * The player command a key press means, or undefined when the press is not a shortcut. A
 * character already carries what Shift did to it (`+` is Shift and `=` on a US keyboard), so
 * Shift picks other commands for the named keys only.
 */
export function shortcutFor(press: KeyPress): ShortcutCommand | undefined {
  if (press.hasSystemModifier) return undefined;
  const isCharacter = press.key.length === 1;
  if (isCharacter) return PLAIN_KEYS.get(press.key.toLowerCase());
  return press.isShiftPressed ? SHIFTED_KEYS.get(press.key) : PLAIN_KEYS.get(press.key);
}

/**
 * What the keyboard drives, and how Escape leaves fullscreen when the element fills the screen.
 */
export interface KeyboardHost extends Pick<
  ControlsHost,
  'togglePlay' | 'toggleFullscreen' | 'isFullscreen'
> {
  readonly player: Pick<
    Player,
    'currentTime' | 'seek' | 'stop' | 'turn' | 'zoom' | 'resetView' | 'isMuted' | 'setMuted'
  >;
  exitFullscreen(): void;
}

type Action = (host: KeyboardHost) => void;

/**
 * How far J, L and the seek slider's arrows move, like a media player's.
 */
export const SEEK_STEP_SECONDS = 5;
const LOOK_STEP_DEGREES = 5;

function seekBy(delta: number): Action {
  return ({ player }): void => {
    player.seek(player.currentTime + delta);
  };
}

function lookBy(yawDelta: number, pitchDelta: number): Action {
  return ({ player }): void => {
    player.turn(yawDelta, pitchDelta);
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
 * Turns key presses on the element into player commands until the returned function is called,
 * leaving the keys a focused control handles itself and the browser's shortcuts alone.
 */
export function bindKeyboard(element: HTMLElement, host: KeyboardHost): () => void {
  const listening = new AbortController();
  element.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape' && host.isFullscreen()) {
        // Kept: the same press would also close a dialog the player sits in.
        event.preventDefault();
        event.stopPropagation();
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
    },
    { signal: listening.signal },
  );
  return (): void => {
    listening.abort();
  };
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
