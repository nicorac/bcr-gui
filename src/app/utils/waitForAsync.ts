/**
 * Wait asynchronously for the given condition to become true.
 * Condition is tested each 'delay' milliseconds and total wait time is limited to maxWaitTimeout milliseconds.
 */
export async function untilTrue(predFn: () => boolean, delay = 250, maxWaitTimeout = 10000) {
  let loops = maxWaitTimeout / delay;
  const poll = (done: any, reject:any) => {
    if (predFn()) {
      done();
    }
    else if (loops-- > 0) {
      setTimeout(() =>  poll(done, reject), delay);
    }
    else {
      reject();
    }
  };

  return new Promise(poll);
};
