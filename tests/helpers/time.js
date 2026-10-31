import { setImmediate } from "node:timers/promises";

export async function withFakeTime(f) {
  const originalPerformanceNow = performance.now;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  let currentTime = 0;
  let nextTimerId = 1;
  let timers = [];

  performance.now = () => currentTime;

  globalThis.setTimeout = (callback, delay = 0) => {
    const id = nextTimerId++;
    timers.push({ id, runAt: currentTime + delay, callback });
    timers.sort((a, b) => a.runAt - b.runAt || a.id - b.id);
    return id;
  };

  globalThis.clearTimeout = (id) => {
    timers = timers.filter((timer) => timer.id !== id);
  };

  const runDueTimers = async () => {
    // Let buffer continuations schedule their next timer before checking the queue.
    await setImmediate();

    while (timers[0] !== undefined && timers[0].runAt <= currentTime) {
      const timer = timers.shift();
      timer.callback();
      await setImmediate();
    }
  };

  try {
    await f({
      now: () => currentTime,
      advanceBy: async (ms) => {
        currentTime += ms;
        await runDueTimers();
      },
    });
  } finally {
    performance.now = originalPerformanceNow;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
}
