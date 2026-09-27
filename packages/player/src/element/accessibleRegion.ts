/**
 * What assistive technology calls the element when the page names it nothing else; the embed
 * snippet titles its frame the same.
 */
const ACCESSIBLE_NAME = '360° video player';

/**
 * The element takes focus and keys, so assistive technology needs to know what it is: a named
 * region, unless the page gave it a role, a name or a tab order of its own.
 */
export function describeUnlessTheAuthorDid(element: HTMLElement): void {
  if (!element.hasAttribute('tabindex')) element.tabIndex = 0;
  if (!element.hasAttribute('role')) element.setAttribute('role', 'region');
  const isNamed = element.hasAttribute('aria-label') || element.hasAttribute('aria-labelledby');
  if (!isNamed) element.setAttribute('aria-label', ACCESSIBLE_NAME);
}
