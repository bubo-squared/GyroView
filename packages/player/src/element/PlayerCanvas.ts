/**
 * The canvas the element's player draws on, replaced by a fresh one before a load when its WebGL
 * context is gone. A context the browser takes away between recordings (an iPhone's background
 * tab, Chrome's limit on the contexts a page holds) is never given back, since only a renderer
 * asks for it back; a removed element gives its own up at once, so a page that adds and removes
 * players does not keep their GPU memory until each canvas is collected.
 */
export class PlayerCanvas {
  private canvas: HTMLCanvasElement;
  private listening = new AbortController();
  private isContextLost = false;
  /**
   * A load has drawn on it, so it may hold a context to give up.
   */
  private isDrawnOn = false;

  /**
   * `onReplaced` hears each fresh canvas, put in the old one's place.
   */
  public constructor(
    canvas: HTMLCanvasElement,
    private readonly onReplaced: (canvas: HTMLCanvasElement) => void,
  ) {
    this.canvas = canvas;
    this.listen();
  }

  public get current(): HTMLCanvasElement {
    return this.canvas;
  }

  /**
   * Before a load: a canvas that can be drawn on, a fresh one in place of one whose context is
   * gone.
   */
  public prepare(): void {
    if (this.isContextLost) this.replace();
    this.isDrawnOn = true;
  }

  /**
   * The element left the document: its context goes now, and the next load draws on a fresh
   * canvas.
   */
  public release(): void {
    if (!this.isDrawnOn) return;
    this.canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();
    this.isContextLost = true;
  }

  private replace(): void {
    const fresh = this.canvas.cloneNode(false);
    if (!(fresh instanceof HTMLCanvasElement)) return;
    this.listening.abort();
    this.canvas.replaceWith(fresh);
    this.canvas = fresh;
    this.isContextLost = false;
    this.isDrawnOn = false;
    this.listen();
    this.onReplaced(fresh);
  }

  /**
   * A renderer drawing on the canvas asks for a lost context back, and hears it restored.
   */
  private listen(): void {
    this.listening = new AbortController();
    const { signal } = this.listening;
    this.canvas.addEventListener(
      'webglcontextlost',
      () => {
        this.isContextLost = true;
      },
      { signal },
    );
    this.canvas.addEventListener(
      'webglcontextrestored',
      () => {
        this.isContextLost = false;
      },
      { signal },
    );
  }
}
