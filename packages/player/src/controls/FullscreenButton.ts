import type { ControlsHost } from './ControlsHost';
import { iconNode } from './icons';

/**
 * Fullscreen, a toggle pressed while the element fills the screen, through the Fullscreen API or
 * pinned over the page, its icon showing which way a press goes. Where the element pins itself, a
 * phone's, there is no Escape: this button is the way out.
 */
export class FullscreenButton {
  public constructor(
    private readonly button: HTMLButtonElement,
    private readonly host: Pick<ControlsHost, 'toggleFullscreen' | 'isFullscreen'>,
  ) {
    button.addEventListener('click', () => {
      host.toggleFullscreen();
    });
    this.reflect();
  }

  /**
   * Shows whether the element fills the screen now.
   */
  public reflect(): void {
    const isActive = this.host.isFullscreen();
    this.button.setAttribute('aria-pressed', String(isActive));
    this.button.replaceChildren(iconNode(isActive ? 'exitFullscreen' : 'fullscreen'));
  }
}
