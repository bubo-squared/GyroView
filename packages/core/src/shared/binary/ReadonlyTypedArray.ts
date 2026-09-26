type Mutators = 'set' | 'fill' | 'copyWithin' | 'sort' | 'reverse' | 'subarray';

/**
 * A typed array exposed by a value object: readable and iterable, without the mutating methods.
 * Callers that need a mutable copy call `slice()`.
 */
export type ReadonlyFloat64Array = Omit<Float64Array, Mutators>;
