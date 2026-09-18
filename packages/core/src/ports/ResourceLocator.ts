/**
 * Port: tells whether a URL can be fetched, used to look for the files a camera writes beside a
 * recording. Implemented over HTTP HEAD; a failure of any kind counts as "not there".
 */
export interface ResourceLocator {
  exists(url: string): Promise<boolean>;
}
