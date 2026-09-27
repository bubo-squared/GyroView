const QUERY_OR_FRAGMENT = /[#?]/u;

/**
 * A URL cut into its path and the query and fragment after it, read as text: relative URLs and
 * ones a URL parser would refuse split too.
 */
export function splitUrl(url: string): { readonly path: string; readonly suffix: string } {
  const suffixStart = url.search(QUERY_OR_FRAGMENT);
  return suffixStart === -1
    ? { path: url, suffix: '' }
    : { path: url.slice(0, suffixStart), suffix: url.slice(suffixStart) };
}

/**
 * The file name a URL names: its last path segment, percent-decoded (kept as written when the
 * encoding is broken); the whole path when there is no slash.
 */
export function fileNameOfUrl(url: string): string {
  const { path } = splitUrl(url);
  const encoded = path.slice(path.lastIndexOf('/') + 1);
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}
