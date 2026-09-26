/**
 * Lets everything the pipeline has scheduled run. The core schedules only microtasks, and so do
 * its fakes, so one hop through the task queue runs them all without waiting on the clock.
 */
export function settle(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
