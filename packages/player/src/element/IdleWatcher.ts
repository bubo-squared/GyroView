const IDLE_ATTRIBUTE = 'data-idle';
const IDLE_DELAY_MS = 2500;
const ACTIVITY_EVENTS = ['pointermove', 'pointerdown', 'keydown', 'focusin'] as const;
/**
 * Activity is heard on its way in, before any control inside can keep it to itself.
 */
const ON_THE_WAY_IN = { capture: true } as const;

/**
 * Marks the element idle when the viewer has left it alone for a while and `shouldHide` agrees
 * (playing, not paused), so the controls can fade; any activity brings them back.
 */
export class IdleWatcher {
  private timer: ReturnType<typeof setTimeout> | undefined;

  public constructor(
    private readonly element: HTMLElement,
    private readonly shouldHide: () => boolean,
  ) {}

  public start(): void {
    for (const name of ACTIVITY_EVENTS) {
      this.element.addEventListener(name, this.onActivity, ON_THE_WAY_IN);
    }
    this.onActivity();
  }

  public stop(): void {
    for (const name of ACTIVITY_EVENTS) {
      this.element.removeEventListener(name, this.onActivity, ON_THE_WAY_IN);
    }
    this.clearTimer();
    this.element.removeAttribute(IDLE_ATTRIBUTE);
  }

  /**
   * Re-evaluates after a state change, so pausing shows the controls at once.
   */
  public refresh(): void {
    if (!this.shouldHide()) this.element.removeAttribute(IDLE_ATTRIBUTE);
    this.restart();
  }

  private readonly onActivity = (): void => {
    this.element.removeAttribute(IDLE_ATTRIBUTE);
    this.restart();
  };

  private restart(): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      if (this.shouldHide()) this.element.setAttribute(IDLE_ATTRIBUTE, '');
    }, IDLE_DELAY_MS);
  }

  private clearTimer(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }
}
