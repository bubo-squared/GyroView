declare const brand: unique symbol;

/**
 * Nominal typing helper: `Brand<number, 'Microseconds'>` is a number that cannot be passed where
 * a `Brand<number, 'Seconds'>` is expected without an explicit conversion.
 */
export type Brand<Base, Name extends string> = Base & { readonly [brand]: Name };
