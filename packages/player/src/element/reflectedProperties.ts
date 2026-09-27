/**
 * Defines properties on a custom element that read and write attributes of the same name, the
 * way `img.src` mirrors its attribute, so the class body stays free of near-identical accessors.
 */
export function defineStringProperties(element: HTMLElement, names: readonly string[]): void {
  for (const name of names) {
    Object.defineProperty(element, propertyNameOf(name), {
      configurable: true,
      enumerable: true,
      get(this: HTMLElement): string | null {
        return this.getAttribute(name);
      },
      set(this: HTMLElement, value: string | null): void {
        writeAttribute(this, name, value);
      },
    });
  }
}

/**
 * Boolean attributes, the value coerced as a media element's `autoplay` coerces it:
 * `toggleAttribute` would take `undefined` for no force at all and flip the attribute.
 */
export function defineBooleanProperties(element: HTMLElement, names: readonly string[]): void {
  for (const name of names) {
    Object.defineProperty(element, propertyNameOf(name), {
      configurable: true,
      enumerable: true,
      get(this: HTMLElement): boolean {
        return this.hasAttribute(name);
      },
      set(this: HTMLElement, isSet: unknown): void {
        this.toggleAttribute(name, Boolean(isSet));
      },
    });
  }
}

/**
 * `null` removes the attribute, as assigning `null` to `img.alt` would not but `removeAttribute`
 * does.
 */
function writeAttribute(element: Element, name: string, value: string | null): void {
  if (value === null) {
    element.removeAttribute(name);
    return;
  }
  element.setAttribute(name, value);
}

const HYPHENATED_LETTER = /-(?<letter>[a-z])/gu;

/**
 * `gain-match` is the property `gainMatch`, as the DOM does for `data-*` and `aria-*`.
 */
export function propertyNameOf(attribute: string): string {
  return attribute.replaceAll(HYPHENATED_LETTER, (_match, letter: string) => letter.toUpperCase());
}
