/**
 * Defines properties on a custom element that read and write attributes of the same name, the
 * way `img.src` mirrors its attribute, so the class body stays free of fourteen near-identical
 * accessors.
 */
export function defineStringProperties(element: HTMLElement, names: readonly string[]): void {
  for (const name of names) {
    Object.defineProperty(element, name, {
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

export function defineNumberProperties(element: HTMLElement, names: readonly string[]): void {
  for (const name of names) {
    Object.defineProperty(element, name, {
      configurable: true,
      enumerable: true,
      get(this: HTMLElement): number | undefined {
        const value = this.getAttribute(name);
        return value === null ? undefined : Number(value);
      },
      set(this: HTMLElement, value: number | undefined): void {
        writeAttribute(this, name, value === undefined ? null : String(value));
      },
    });
  }
}

export function defineBooleanProperties(element: HTMLElement, names: readonly string[]): void {
  for (const name of names) {
    Object.defineProperty(element, name, {
      configurable: true,
      enumerable: true,
      get(this: HTMLElement): boolean {
        return this.hasAttribute(name);
      },
      set(this: HTMLElement, isSet: boolean): void {
        this.toggleAttribute(name, isSet);
      },
    });
  }
}

/**
 * `null` removes the attribute, as assigning `null` to `img.alt` would not but `removeAttribute`
 * does; the properties here are the only writers.
 */
function writeAttribute(element: Element, name: string, value: string | null): void {
  if (value === null) {
    element.removeAttribute(name);
    return;
  }
  element.setAttribute(name, value);
}
