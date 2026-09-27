const FILL_ATTRIBUTE = 'data-fill';

/**
 * Fills the screen with the element through the Fullscreen API where there is one, and by
 * pinning the element over the page where there is not (iPhone Safari has none for anything
 * but a video). Escape leaves either way.
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
    this.element.removeAttribute(FILL_ATTRIBUTE);
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
    this.element.setAttribute(FILL_ATTRIBUTE, '');
  }
}
