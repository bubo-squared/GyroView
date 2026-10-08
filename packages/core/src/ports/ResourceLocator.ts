/**
 * Port: tells whether a URL can be fetched, used to look for the other lens file beside a
 * recording. The file is optional: one the server says it does not have, or that cannot be asked
 * about at all, counts as not there. A lookup its server never answered rejects, as does one an
 * abort ended: a visitor must not be asked for a file that may be there.
 */
export interface ResourceLocator {
  exists(url: string): Promise<boolean>;
}
