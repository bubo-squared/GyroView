/**
 * A record with each value of `every` turned by `map`, under the same keys: a table declared once
 * becomes a record of what it describes, and the record's type keeps every key of the table.
 */
export function mapRecord<Key extends string, Value, Result>(
  every: Readonly<Record<Key, Value>>,
  map: (value: Value, key: Key) => Result,
): Record<Key, Result> {
  // Object.entries and Object.fromEntries cannot know the record holds exactly its keys; it does.
  const entries = (Object.entries(every) as [Key, Value][]).map(
    ([key, value]) => [key, map(value, key)] as const,
  );
  return Object.fromEntries(entries) as Record<Key, Result>;
}
