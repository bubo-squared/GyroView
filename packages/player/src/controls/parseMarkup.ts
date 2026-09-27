import { lazy } from '@gyroview/core';

/**
 * The Trusted Types policy the element parses its own markup through. A page that enforces
 * Trusted Types allows it by name in its CSP: `trusted-types gyroview`.
 */
export const MARKUP_POLICY_NAME = 'gyroview';

declare const trusted: unique symbol;

/**
 * A `TrustedHTML`, which TypeScript's DOM types do not name.
 */
interface TrustedMarkup {
  readonly [trusted]: true;
}

interface MarkupPolicy {
  createHTML(markup: string): TrustedMarkup;
}

interface TrustedTypeFactory {
  createPolicy(name: string, rules: { createHTML(markup: string): string }): MarkupPolicy;
}

/**
 * Parses markup this package built from its own constants into nodes to clone. Where the browser
 * has Trusted Types the markup goes through the policy, which passes it on as it is: a page that
 * enforces them refuses a plain string.
 */
export function parseMarkup(markup: string): DocumentFragment {
  const template = document.createElement('template');
  const html = markupPolicy()?.createHTML(markup) ?? markup;
  // innerHTML takes a TrustedHTML as well as a string; TypeScript's DOM types name only strings.
  template.innerHTML = html as string;
  return template.content;
}

/**
 * Made once per page: a second policy of the same name is refused where the CSP names it.
 */
const markupPolicy = lazy((): MarkupPolicy | undefined => {
  const factory = (globalThis as { readonly trustedTypes?: TrustedTypeFactory }).trustedTypes;
  try {
    return factory?.createPolicy(MARKUP_POLICY_NAME, { createHTML: (markup) => markup });
  } catch {
    // The page's CSP allows no policy of this name: the plain string is all there is.
    return undefined;
  }
});
