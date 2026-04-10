import { test, expect } from "@playwright/test";
import getBuffer from "../../src/buffer.js";

test("buffer groups consecutive output events within minFrameTime", async () => {
  const events = [];

  const buf = createBuffer({
    dispatch: (name, payload) => events.push({ name, payload }),
  });

  const baseTime = performance.now() / 1000;

  try {
    buf.pushEvent([baseTime, "o", "a"]);
    buf.pushEvent([baseTime + 0.005, "o", "b"]);

    await expect.poll(() => events).toEqual([{ name: "output", payload: ["a", "b"] }]);
  } finally {
    buf.stop();
  }
});

test("buffer flushes output before non-output events", async () => {
  const events = [];

  const buf = createBuffer({
    dispatch: (name, payload) => events.push({ name, payload }),
  });

  const baseTime = performance.now() / 1000;

  try {
    buf.pushEvent([baseTime, "o", "a"]);
    buf.pushEvent([baseTime + 0.001, "r", { cols: 100, rows: 30 }]);
    buf.pushEvent([baseTime + 0.002, "o", "b"]);

    await expect
      .poll(() => events)
      .toEqual([
        { name: "output", payload: ["a"] },
        { name: "resize", payload: { cols: 100, rows: 30 } },
        { name: "output", payload: ["b"] },
      ]);
  } finally {
    buf.stop();
  }
});

test("buffer splits output groups outside the anchored window", async () => {
  const events = [];

  const buf = createBuffer({
    dispatch: (name, payload) => events.push({ name, payload }),
    minFrameTime: 0.01,
  });

  const baseTime = performance.now() / 1000;

  try {
    buf.pushEvent([baseTime, "o", "a"]);
    buf.pushEvent([baseTime + 0.005, "o", "b"]);
    buf.pushEvent([baseTime + 0.012, "o", "c"]);

    await expect
      .poll(() => events)
      .toEqual([
        { name: "output", payload: ["a", "b"] },
        { name: "output", payload: ["c"] },
      ]);
  } finally {
    buf.stop();
  }
});

test("buffer groups pushText output with output events", async () => {
  const events = [];
  const baseTime = performance.now() / 1000;

  const buf = createBuffer({
    dispatch: (name, payload) => events.push({ name, payload }),
    baseStreamTime: baseTime,
  });

  try {
    buf.pushEvent([baseTime, "o", "a"]);
    buf.pushText("b");

    await expect.poll(() => events).toEqual([{ name: "output", payload: ["a", "b"] }]);
  } finally {
    buf.stop();
  }
});

test("buffer keeps earlier events on their original schedule when buffer time increases", async () => {
  await withFakeTime(async ({ advanceBy, now }) => {
    const events = [];
    const setTimeCalls = [];

    const buf = createBuffer({
      bufferTime: () => sequenceBufferTime([20, 20, 200]),
      dispatch: (name, payload) => events.push({ name, payload, at: now() }),
      setTime: (time) => setTimeCalls.push({ time, at: now() }),
      baseStreamTime: 0,
    });

    buf.pushEvent([0, "o", "A"]);
    await advanceBy(5);
    buf.pushEvent([0.005, "o", "B"]);

    await advanceBy(14);
    expect(events).toEqual([]);
    expect(setTimeCalls).toEqual([]);

    await advanceBy(1);
    expect(events).toEqual([{ name: "output", payload: ["A"], at: 20 }]);
    expect(setTimeCalls).toEqual([{ time: 0, at: 20 }]);

    await advanceBy(185);

    expect(events).toEqual([
      { name: "output", payload: ["A"], at: 20 },
      { name: "output", payload: ["B"], at: 205 },
    ]);

    expect(setTimeCalls).toEqual([
      { time: 0, at: 20 },
      { time: 0.005, at: 205 },
    ]);

    buf.stop();
  });
});

test("buffer keeps earlier events delayed when buffer time drops", async () => {
  await withFakeTime(async ({ advanceBy, now }) => {
    const events = [];
    const setTimeCalls = [];

    const buf = createBuffer({
      bufferTime: () => sequenceBufferTime([200, 200, 20]),
      dispatch: (name, payload) => events.push({ name, payload, at: now() }),
      setTime: (time) => setTimeCalls.push({ time, at: now() }),
      baseStreamTime: 0,
    });

    buf.pushEvent([0, "o", "A"]);
    await advanceBy(50);
    buf.pushEvent([0.005, "o", "B"]);

    await advanceBy(149);
    expect(events).toEqual([]);
    expect(setTimeCalls).toEqual([]);

    await advanceBy(1);

    await expect
      .poll(() => ({ events, setTimeCalls }))
      .toEqual({
        events: [
          { name: "output", payload: ["A"], at: 200 },
          { name: "output", payload: ["B"], at: 200 },
        ],
        setTimeCalls: [{ time: 0, at: 200 }],
      });

    buf.stop();
  });
});

test("null buffer emits individual output strings", () => {
  const events = [];

  const buf = createBuffer({
    bufferTime: 0,
    dispatch: (name, payload) => events.push({ name, payload }),
  });

  buf.pushEvent([0, "o", "a"]);
  buf.pushEvent([0.001, "o", "b"]);

  expect(events).toEqual([
    { name: "output", payload: "a" },
    { name: "output", payload: "b" },
  ]);
});

function createBuffer({
  bufferTime = 1,
  dispatch = () => {},
  setTime = () => {},
  baseStreamTime = performance.now() / 1000,
  minFrameTime = 1 / 60,
} = {}) {
  return getBuffer(bufferTime, dispatch, setTime, baseStreamTime, minFrameTime, stubLogger());
}

function sequenceBufferTime(values) {
  let index = 0;

  return () => {
    const value = values[Math.min(index, values.length - 1)];
    index++;
    return value;
  };
}

async function withFakeTime(f) {
  const originalPerformanceNow = performance.now.bind(performance);
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
    while (timers[0] !== undefined && timers[0].runAt <= currentTime) {
      const timer = timers.shift();
      timer.callback();
      await Promise.resolve();
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

function stubLogger() {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {},
  };
}
