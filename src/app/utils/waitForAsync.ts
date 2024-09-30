/**
 * Wait asynchronously for the given condition to become true,
 * then execute the given function.
 */
export function asyncWaitForCondition(execCondition: () => boolean, exec: () => any, maxWait = 3000, delay = 250) {

  if (!execCondition()) {
    if (maxWait >= 0) {
      // reschedule
      setTimeout(() => {
        asyncWaitForCondition(execCondition, exec, maxWait-delay, delay);
      }, delay);
    }
  }
  else {
    // execute function
    exec();
  }

}