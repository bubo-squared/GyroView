import type { ResourceLocator } from '../ports/ResourceLocator';

/**
 * Test double for the locator port: knows a fixed set of URLs and records what it was asked.
 */
export class FakeResourceLocator implements ResourceLocator {
  public readonly asked: string[] = [];
  private readonly known: ReadonlySet<string>;

  public constructor(existingUrls: readonly string[]) {
    this.known = new Set(existingUrls);
  }

  public exists(url: string): Promise<boolean> {
    this.asked.push(url);
    return Promise.resolve(this.known.has(url));
  }
}
