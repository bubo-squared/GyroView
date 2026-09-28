/**
 * The keys of a record that names each of `Key` once, as a list to use at run time: the record's
 * type makes the compiler refuse a missing or an unknown key, which a list alone would not.
 */
export function keysOf<Key extends string>(every: Readonly<Record<Key, true>>): readonly Key[] {
  // Object.keys cannot know the record holds nothing but its keys; its type says it does.
  return Object.keys(every) as Key[];
}
