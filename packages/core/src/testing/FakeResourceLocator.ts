import type { ResourceLocator } from '../ports/ResourceLocator';
import { GyroViewError } from '../shared/errors/GyroViewError';

export interface FakeResourceLocatorOptions {
  /**
   * URLs whose server never answers the lookup, even when asked again.
   */
  readonly unanswered?: readonly string[];
}

/**
 * Test double for the locator port: knows a fixed set of URLs and records what it was asked.
 */
export class FakeResourceLocator implements ResourceLocator {
  public readonly asked: string[] = [];
  private readonly known: ReadonlySet<string>;
  private readonly unanswered: ReadonlySet<string>;

  public constructor(existingUrls: readonly string[], options: FakeResourceLocatorOptions = {}) {
    this.known = new Set(existingUrls);
    this.unanswered = new Set(options.unanswered);
  }

  public exists(url: string): Promise<boolean> {
    this.asked.push(url);
    return this.unanswered.has(url)
      ? Promise.reject(new GyroViewError('source-unreadable', `${url} was never answered`))
      : Promise.resolve(this.known.has(url));
  }
}
