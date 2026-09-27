/**
 * The element takes focus and keys, so assistive technology needs to know what it is: a region
 * called `name`, unless the page gave it a role, a name or a tab order of its own.
 */
export function describeUnlessTheAuthorDid(element: HTMLElement, name: string): void {
  if (!element.hasAttribute('tabindex')) element.tabIndex = 0;
  if (!element.hasAttribute('role')) element.setAttribute('role', 'region');
  const isNamed = element.hasAttribute('aria-label') || element.hasAttribute('aria-labelledby');
  if (!isNamed) element.setAttribute('aria-label', name);
}

/**
 * The element's name after a change of words: the new one where it bore its own name, the
 * page's where the page named it.
 */
export function renameUnlessTheAuthorDid(
  element: HTMLElement,
  previousName: string,
  name: string,
): void {
  if (element.getAttribute('aria-label') === previousName) element.setAttribute('aria-label', name);
}
