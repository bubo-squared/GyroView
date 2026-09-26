/**
 * The opaque origin sandboxed frames and `file:` pages report; never trusted.
 */
const OPAQUE_ORIGIN = 'null';

/**
 * Whether a message from `origin` may drive the player, given the origins the page names;
 * there is no wildcard (ADR 0010).
 */
export function isTrustedOrigin(origin: string, allowed: readonly string[]): boolean {
  const isAnonymous = origin === OPAQUE_ORIGIN || origin === '';
  return !isAnonymous && allowed.includes(origin);
}

/**
 * The origin of a URL, or undefined when it has none worth trusting.
 */
export function originOf(url: string): string | undefined {
  try {
    const { origin } = new URL(url);
    return origin === OPAQUE_ORIGIN ? undefined : origin;
  } catch {
    return undefined;
  }
}
