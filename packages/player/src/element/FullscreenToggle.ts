const FILL_ATTRIBUTE = 'data-fill';
const POPOVER_ATTRIBUTE = 'popover';
/**
 * No light dismiss and no Escape of the browser's: the element's own keys and button leave.
 */
const MANUAL_POPOVER = 'manual';

/**
 * Fills the screen with the element through the Fullscreen API where there is one, and by
 * pinning the element over the page where there is not (iPhone Safari has none for anything
 * but a video). Escape leaves either way.
 *
 * The pinned element is a manual popover, in the top layer the browser's own fullscreen uses:
 * no transform, clip or stacking context of the page holds it there. Pinned in place, a dialog
 * centred by a transform would make its fixed position fill the dialog, not the viewport. A
 * browser without popovers pins it in place all the same.
 */
export class FullscreenToggle {
  public constructor(private readonly element: HTMLElement) {}

  public get isActive(): boolean {
    return this.isNativelyFullscreen() || this.element.hasAttribute(FILL_ATTRIBUTE);
  }

  public async toggle(): Promise<void> {
    await (this.isActive ? this.exit() : this.enter());
  }

  public async exit(): Promise<void> {
    if (this.isNativelyFullscreen()) await document.exitFullscreen();
    // Without the attribute, the browser takes the element out of the top layer.
    this.element.removeAttribute(POPOVER_ATTRIBUTE);
    this.element.removeAttribute(FILL_ATTRIBUTE);
  }

  /**
   * The browser takes a popover out of the top layer when its element leaves the document, so a
   * pinned element the page moves goes back in once it is connected again.
   */
  public connected(): void {
    if (this.element.hasAttribute(FILL_ATTRIBUTE)) this.raiseToTopLayer();
  }

  /**
   * Asked of the element itself: `document.fullscreenElement` names the outermost shadow host
   * instead when the player sits inside another component.
   */
  private isNativelyFullscreen(): boolean {
    return this.element.matches(':fullscreen');
  }

  private async enter(): Promise<void> {
    if (document.fullscreenEnabled) {
      try {
        await this.element.requestFullscreen();
        return;
      } catch {
        // The browser declined (no gesture, an iframe without the permission): pin instead.
      }
    }
    // Removed while the browser answered: a removal leaves the fill, so there is none to enter.
    if (!this.element.isConnected) return;
    this.element.setAttribute(FILL_ATTRIBUTE, '');
    this.raiseToTopLayer();
  }

  /**
   * Out of the document there is no top layer to show it in; `connected` raises it on arrival.
   */
  private raiseToTopLayer(): void {
    if (!hasPopovers() || !this.element.isConnected || this.element.matches(':popover-open')) {
      return;
    }
    this.element.setAttribute(POPOVER_ATTRIBUTE, MANUAL_POPOVER);
    this.element.showPopover();
  }
}

/**
 * The browser's own popovers, the method and the selector both: Safari has them from 17, and
 * before it does not even parse `:popover-open`, which a polyfill's `showPopover` cannot change.
 */
function hasPopovers(): boolean {
  return 'showPopover' in HTMLElement.prototype && CSS.supports('selector(:popover-open)');
}
