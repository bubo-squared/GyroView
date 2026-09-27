import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';

/**
 * V8 hands out its collector to contexts made after it was asked for: a new context gets it.
 */
function exposedCollector(): () => void {
  setFlagsFromString('--expose-gc');
  return runInNewContext('gc') as () => void;
}

/**
 * Whether the target of `reference` is gone once collected, nothing else holding it. The
 * collection waits for the next task: V8 keeps a weak target alive until the job that made it ends.
 */
export async function isCollected(reference: WeakRef<object>): Promise<boolean> {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
  exposedCollector()();
  return reference.deref() === undefined;
}
