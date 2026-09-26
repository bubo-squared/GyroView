/**
 * One choice menu in the shadow tree: the button that opens it, and the popup holding the
 * choices, each a `menuitemradio` naming its choice in `data-choice`.
 */
export interface ChoiceMenuParts {
  readonly button: HTMLButtonElement;
  readonly popup: HTMLElement;
}

type FocusStep = (index: number, count: number) => number;

/**
 * Where each navigation key moves the focus among `count` choices from the one at `index`.
 */
const FOCUS_STEPS: ReadonlyMap<string, FocusStep> = new Map<string, FocusStep>([
  ['ArrowDown', (index, count): number => (index + 1) % count],
  ['ArrowUp', (index, count): number => (index - 1 + count) % count],
  ['Home', (): number => 0],
  ['End', (_index, count): number => count - 1],
]);

/**
 * Presses are seen on their way in, before the control they land on.
 */
const ON_THE_WAY_IN = { capture: true } as const;

/**
 * A button opening a popup of choices with the current one checked. The button toggles it; a
 * choice, Escape, a press outside it or the focus moving elsewhere closes it; the arrow keys
 * move between the choices. A press outside only closes it, so a tap on the picture does not
 * also toggle play, and keys pressed while it is open stay with it, so one Escape does not also
 * leave fullscreen and the arrows do not turn the view.
 */
export class ChoiceMenu {
  private readonly items: readonly HTMLElement[];

  public constructor(
    root: ParentNode,
    private readonly parts: ChoiceMenuParts,
    choose: (choice: string) => void,
  ) {
    this.items = [...parts.popup.querySelectorAll<HTMLElement>(':scope [role="menuitemradio"]')];
    for (const item of this.items) {
      item.addEventListener('click', () => {
        this.closeToButton();
        const { choice } = item.dataset;
        if (choice !== undefined) choose(choice);
      });
    }
    this.bindOpening(root);
  }

  private get isOpen(): boolean {
    return !this.parts.popup.hidden;
  }

  public markChosen(choice: string): void {
    for (const item of this.items) {
      item.setAttribute('aria-checked', String(item.dataset['choice'] === choice));
    }
  }

  /**
   * Shows or hides the button; a menu that goes away closes.
   */
  public setAvailable(isAvailable: boolean): void {
    this.parts.button.hidden = !isAvailable;
    if (!isAvailable) this.setOpen(false);
  }

  private bindOpening(root: ParentNode): void {
    const { button, popup } = this.parts;
    button.addEventListener('click', () => {
      this.setOpen(!this.isOpen);
      if (this.isOpen) this.focusItem(this.items.findIndex((item) => isChecked(item)));
    });
    root.addEventListener(
      'pointerdown',
      (event) => {
        if (!this.isOpen) return;
        const isInside = event.composedPath().some((node) => node === popup || node === button);
        if (isInside) return;
        this.setOpen(false);
        event.stopPropagation();
      },
      ON_THE_WAY_IN,
    );
    root.addEventListener('focusout', (event) => {
      const next = event instanceof FocusEvent ? event.relatedTarget : null;
      const isLeaving = next !== button && next instanceof Node && !popup.contains(next);
      if (isLeaving) this.setOpen(false);
    });
    root.addEventListener('keydown', (event) => {
      if (this.isOpen && event instanceof KeyboardEvent) this.onKey(event);
    });
  }

  private onKey(event: KeyboardEvent): void {
    const path = event.composedPath();
    if (event.key === 'Escape') {
      this.closeToButton();
      event.stopPropagation();
      return;
    }
    if (!path.includes(this.parts.popup)) return;
    event.stopPropagation();
    this.moveFocus(event, path);
  }

  private moveFocus(event: KeyboardEvent, path: readonly EventTarget[]): void {
    const step = FOCUS_STEPS.get(event.key);
    if (!step) return;
    event.preventDefault();
    const current = this.items.findIndex((item) => path.includes(item));
    this.focusItem(step(current, this.items.length));
  }

  private focusItem(index: number): void {
    (this.items[index] ?? this.items[0])?.focus();
  }

  private closeToButton(): void {
    this.setOpen(false);
    this.parts.button.focus();
  }

  private setOpen(isOpen: boolean): void {
    this.parts.popup.hidden = !isOpen;
    this.parts.button.setAttribute('aria-expanded', String(isOpen));
  }
}

function isChecked(item: HTMLElement): boolean {
  return item.getAttribute('aria-checked') === 'true';
}
