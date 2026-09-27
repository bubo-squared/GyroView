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
  private wasIdleAtPress = false;

  public constructor(
    private readonly element: HTMLElement,
    private readonly shouldHide: () => boolean,
  ) {}

  /**
   * Whether the controls were hidden when the last press began: on touch, which has no hover,
   * such a press is how the viewer brings them back.
   */
  public get wasIdleAtLastPress(): boolean {
    return this.wasIdleAtPress;
  }

  public start(): void {
    // Before the activity listeners, which bring the controls back on the same press.
    this.element.addEventListener('pointerdown', this.onPress, ON_THE_WAY_IN);
    for (const name of ACTIVITY_EVENTS) {
      this.element.addEventListener(name, this.onActivity, ON_THE_WAY_IN);
    }
    this.onActivity();
  }

  public stop(): void {
    for (const name of ACTIVITY_EVENTS) {
      this.element.removeEventListener(name, this.onActivity, ON_THE_WAY_IN);
    }
    this.element.removeEventListener('pointerdown', this.onPress, ON_THE_WAY_IN);
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

  private readonly onPress = (): void => {
    this.wasIdleAtPress = this.element.hasAttribute(IDLE_ATTRIBUTE);
  };

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
