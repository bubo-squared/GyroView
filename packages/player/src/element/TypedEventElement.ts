import type { PlayerEvents } from '../player/PlayerEvents';

/**
 * The events `<gyro-view>` dispatches: each player event as a `CustomEvent` of the same name,
 * its payload in `detail`. They take the place of the element events some share a name with
 * (`play`, `pause`, `error`...), which a custom element never fires itself.
 */
export type GyroViewElementEventMap = Omit<HTMLElementEventMap, keyof PlayerEvents> & {
  readonly [Name in keyof PlayerEvents]: CustomEvent<PlayerEvents[Name]>;
};

/**
 * `HTMLElement` in a browser; elsewhere a stand-in, so that a server rendering the page, or a
 * script importing the package for `inspectRecording`, can evaluate this module. The element is
 * only ever constructed where `customElements` defined it: in a browser.
 */
const ElementBase: typeof HTMLElement =
  typeof HTMLElement === 'function' ? HTMLElement : (Object as unknown as typeof HTMLElement);

/**
 * The HTMLElement `<gyro-view>` builds on, whose `addEventListener` and `removeEventListener`
 * know the events it fires, where the DOM's own map would name other types. The overrides only
 * pass through.
 */
export class TypedEventElement extends ElementBase {
  public override addEventListener<Name extends keyof GyroViewElementEventMap>(
    type: Name,
    listener: (this: this, event: GyroViewElementEventMap[Name]) => unknown,
    options?: boolean | AddEventListenerOptions,
  ): void;
  public override addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void;
  public override addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void {
    super.addEventListener(type, listener, options);
  }

  public override removeEventListener<Name extends keyof GyroViewElementEventMap>(
    type: Name,
    listener: (this: this, event: GyroViewElementEventMap[Name]) => unknown,
    options?: boolean | EventListenerOptions,
  ): void;
  public override removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ): void;
  public override removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ): void {
    super.removeEventListener(type, listener, options);
  }
}
