type Mutators = 'set' | 'fill' | 'copyWithin' | 'sort' | 'reverse' | 'subarray';

/**
 * Typed arrays exposed by value objects: readable and iterable, without the mutating methods.
 * Callers that need a mutable copy call `slice()`.
 */
export type ReadonlyFloat64Array = Omit<Float64Array, Mutators>;
export type ReadonlyFloat32Array = Omit<Float32Array, Mutators>;
