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
      set(this: HTMLElement, value: string | null | undefined): void {
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
 * An enumerated attribute, as a media element's `preload` is: the keywords it takes, and the one
 * in effect when it names none of them.
 */
export interface KeywordAttribute<Keyword extends string> {
  readonly name: string;
  readonly keywords: readonly Keyword[];
  readonly fallback: Keyword;
}

/**
 * Enumerated attributes, whose property reads the keyword in effect, however the attribute
 * spells it, and writes the attribute.
 */
export function defineKeywordProperties(
  element: HTMLElement,
  attributes: readonly KeywordAttribute<string>[],
): void {
  for (const attribute of attributes) {
    Object.defineProperty(element, propertyNameOf(attribute.name), {
      configurable: true,
      enumerable: true,
      get(this: HTMLElement): string {
        return keywordOf(attribute, this.getAttribute(attribute.name));
      },
      set(this: HTMLElement, value: string | null | undefined): void {
        writeAttribute(this, attribute.name, value);
      },
    });
  }
}

/**
 * An enumerated attribute whose absence is a state of its own, as a media element's `crossorigin`
 * is, under the property name the DOM gives it (`crossOrigin`) rather than one derived from the
 * attribute's.
 */
export interface NullableKeywordAttribute<
  Keyword extends string,
> extends KeywordAttribute<Keyword> {
  readonly property: string;
}

/**
 * Enumerated attributes whose property reads `null` while the attribute is absent and the keyword
 * in effect otherwise, the fallback for an empty or unknown value, as the DOM reflects
 * `crossOrigin`; it writes the attribute.
 */
export function defineNullableKeywordProperties(
  element: HTMLElement,
  attributes: readonly NullableKeywordAttribute<string>[],
): void {
  for (const attribute of attributes) {
    Object.defineProperty(element, attribute.property, {
      configurable: true,
      enumerable: true,
      get(this: HTMLElement): string | null {
        const value = this.getAttribute(attribute.name);
        return value === null ? null : keywordOf(attribute, value);
      },
      set(this: HTMLElement, value: string | null | undefined): void {
        writeAttribute(this, attribute.name, value);
      },
    });
  }
}

/**
 * The keyword an enumerated attribute's value names, ignoring case and spacing; the fallback for
 * an absent or unknown one.
 */
export function keywordOf<Keyword extends string>(
  attribute: KeywordAttribute<Keyword>,
  value: string | null,
): Keyword {
  const spoken = value?.trim().toLowerCase();
  return attribute.keywords.find((keyword) => keyword === spoken) ?? attribute.fallback;
}

/**
 * `null` or `undefined` removes the attribute, as assigning either to `img.alt` would not but
 * `removeAttribute` does: a framework unsetting a property assigns `undefined`, which would
 * otherwise be written as the text "undefined".
 */
export function writeAttribute(
  element: Element,
  name: string,
  value: string | null | undefined,
): void {
  if (value === null || value === undefined) {
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
