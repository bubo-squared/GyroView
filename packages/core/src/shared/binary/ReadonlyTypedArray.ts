type Mutators = 'set' | 'fill' | 'copyWithin' | 'sort' | 'reverse' | 'subarray';

/**
 * A typed array exposed by a value object: readable and iterable, without the mutating methods
 * or writes to its elements, which `Omit` alone would leave writable. Callers that need a
 * mutable copy call `slice()`.
 */
export type ReadonlyFloat64Array = Readonly<Omit<Float64Array, Mutators>>;
