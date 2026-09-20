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
 * Keys as `KeyboardEvent.key` reports them. Space and K play, J and L seek, the arrows look
 * around (with Shift they seek), M mutes, F fills the screen, 0 resets the view, plus and minus
 * zoom.
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
