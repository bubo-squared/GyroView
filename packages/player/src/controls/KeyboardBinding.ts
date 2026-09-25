import { shortcutFor } from './keyboardShortcuts';
import { runShortcut, type ShortcutTarget } from './shortcutActions';

export interface KeyboardHost extends ShortcutTarget {
  /**
   * Escape leaves fullscreen when the element fills the screen.
   */
  readonly isFullscreen: () => boolean;
  exitFullscreen(): void;
}

/**
 * Turns key presses on the element into player commands, leaving the controls' own inputs and
 * the browser's shortcuts alone.
 */
export class KeyboardBinding {
  public constructor(
    element: HTMLElement,
    private readonly host: KeyboardHost,
  ) {
    element.addEventListener('keydown', this.onKeyDown);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && this.host.isFullscreen()) {
      this.host.exitFullscreen();
      return;
    }
    if (isEditable(event.target)) return;
    const command = shortcutFor({
      key: event.key,
      isShiftPressed: event.shiftKey,
      hasSystemModifier: event.ctrlKey || event.altKey || event.metaKey,
    });
    if (!command) return;
    event.preventDefault();
    runShortcut(command, this.host);
  };
}

/**
 * Keys typed into the controls' own inputs and selects belong to them.
 */
function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement
  );
}
