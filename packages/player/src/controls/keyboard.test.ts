import { describe, expect, it } from 'vitest';

import { shortcutFor, type KeyPress } from './keyboard';

function press(key: string, modifiers: Partial<Omit<KeyPress, 'key'>> = {}): KeyPress {
  return { key, isShiftPressed: false, hasSystemModifier: false, ...modifiers };
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
    expect(shortcutFor(press('ArrowLeft', { isShiftPressed: true }))).toBe('seek-back');
    expect(shortcutFor(press('ArrowRight', { isShiftPressed: true }))).toBe('seek-forward');
    expect(shortcutFor(press('ArrowUp', { isShiftPressed: true }))).toBeUndefined();
  });

  it('zooms and resets the view', () => {
    expect(shortcutFor(press('+'))).toBe('zoom-in');
    expect(shortcutFor(press('='))).toBe('zoom-in');
    expect(shortcutFor(press('-'))).toBe('zoom-out');
    expect(shortcutFor(press('0'))).toBe('reset-view');
  });

  it('reads a character as the key reports it, Shift already applied', () => {
    // Plus is Shift and = on US and UK keyboards; the digits are shifted on AZERTY.
    expect(shortcutFor(press('+', { isShiftPressed: true }))).toBe('zoom-in');
    expect(shortcutFor(press('0', { isShiftPressed: true }))).toBe('reset-view');
  });

  it('leaves browser shortcuts and unknown keys alone', () => {
    expect(shortcutFor(press('k', { hasSystemModifier: true }))).toBeUndefined();
    expect(shortcutFor(press('q'))).toBeUndefined();
    expect(shortcutFor(press('Enter'))).toBeUndefined();
  });
});
