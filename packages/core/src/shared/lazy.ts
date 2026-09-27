/**
 * A value made on first request and kept: for what costs work to build and may never be asked
 * for, such as an element's parsed markup on a page that renders none.
 */
export function lazy<Value>(make: () => Value): () => Value {
  let made: { readonly value: Value } | undefined;
  return () => (made ??= { value: make() }).value;
}
