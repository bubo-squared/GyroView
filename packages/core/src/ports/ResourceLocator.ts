/**
 * Port: tells whether a URL can be fetched, used to look for the other lens file beside a
 * recording. A failure of any kind counts as "not there": the file is optional.
 */
export interface ResourceLocator {
  exists(url: string): Promise<boolean>;
}
