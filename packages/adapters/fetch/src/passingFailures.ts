import { GyroViewError } from '@gyroview/core';

/**
 * The failures on the way, which asking again may cure; any other fails the read at once. They
 * are `source-unreadable` errors like any other, so a caller that gets one after the retries
 * cannot tell, and need not: only the retry loop asks.
 */
const passingFailures = new WeakSet<GyroViewError>();

export function passing(failure: GyroViewError): GyroViewError {
  passingFailures.add(failure);
  return failure;
}

export function isPassing(error: unknown): boolean {
  return error instanceof GyroViewError && passingFailures.has(error);
}

/**
 * A request that did not get through for want of a network is worth another try.
 */
export function passingIfUnreachable(error: unknown): unknown {
  return isUnreachable(error)
    ? passing(new GyroViewError('source-unreadable', error.message, { cause: error.cause }))
    : error;
}

/**
 * A request that did not get through for want of a network, as `httpRequest` diagnoses it: its
 * server did not answer even a request that asks for no CORS answer.
 */
export function isUnreachable(error: unknown): error is GyroViewError {
  return error instanceof GyroViewError && error.code === 'source-unreadable';
}
