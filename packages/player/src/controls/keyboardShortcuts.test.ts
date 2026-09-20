import { describe, expect, it } from 'vitest';

import { shortcutFor } from './keyboardShortcuts';

function press(
  key: string,
  isShiftPressed = false,
  hasSystemModifier = false,
): Parameters<typeof shortcutFor>[0] {
  return { key, isShiftPressed, hasSystemModifier };
}

describe('shortcutFor', () => {
  it('maps the transport keys, ignoring letter case', () => {
    expect(shortcutFor(press(' '))).toBe('toggle-play');
    expect(shortcutFor(press('K'))).toBe('toggle-play');
    expect(shortcutFor(press('j'))).toBe('seek-back');
    expect(shortcutFor(press('l'))).toBe('seek-forward');
    expect(shortcutFor(press('s'))).toBe('stop');
    expect(shortcutFor(press('m'))).toBe('toggle-mute');
    expect(shortcutFor(press('f'))).toBe('toggle-fullscreen');
  });

  it('looks around with the arrows and seeks with shifted arrows', () => {
    expect(shortcutFor(press('ArrowLeft'))).toBe('look-left');
    expect(shortcutFor(press('ArrowUp'))).toBe('look-up');
    expect(shortcutFor(press('ArrowLeft', true))).toBe('seek-back');
    expect(shortcutFor(press('ArrowRight', true))).toBe('seek-forward');
    expect(shortcutFor(press('ArrowUp', true))).toBeUndefined();
  });

  it('zooms and resets the view', () => {
    expect(shortcutFor(press('+'))).toBe('zoom-in');
    expect(shortcutFor(press('='))).toBe('zoom-in');
    expect(shortcutFor(press('-'))).toBe('zoom-out');
    expect(shortcutFor(press('0'))).toBe('reset-view');
  });

  it('leaves browser shortcuts and unknown keys alone', () => {
    expect(shortcutFor(press('k', false, true))).toBeUndefined();
    expect(shortcutFor(press('q'))).toBeUndefined();
    expect(shortcutFor(press('Enter'))).toBeUndefined();
  });
});
