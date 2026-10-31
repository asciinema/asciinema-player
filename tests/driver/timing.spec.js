import { test, expect } from "@playwright/test";
import { mock } from "node:test";
import random from "../../src/driver/random.js";
import benchmark from "../../src/driver/benchmark.js";
import wallClock from "../../src/driver/clock.js";
import { getTime } from "../../src/timing.js";

let now;

test.beforeEach(() => {
  now = 1000;
  mock.method(performance, "now", () => now);
});

test.afterEach(() => mock.restoreAll());

test("random playback publishes its speed and freezes on stop", () => {
  const timings = [];

  const driver = random(
    {},
    { dispatch: (name, payload) => name === "timing" && timings.push(payload) },
    { speed: 2 },
  );

  try {
    expect(driver.getTiming()).toMatchObject({ time: null, rate: 0 });
    driver.play();
    expect(timings.at(-1)).toEqual({ time: 0, rate: 2, sampledAt: performance.timeOrigin + now });

    now += 250;
    driver.play();
    expect(driver.getTiming()).toMatchObject({ time: 0.5, rate: 2 });
    expect(getTime(timings.at(-1))).toBe(0.5);

    driver.stop();
    expect(timings.at(-1)).toMatchObject({ time: 0.5, rate: 0 });

    now += 1000;
    expect(driver.getTiming()).toMatchObject({ time: 0.5, rate: 0 });
  } finally {
    driver.stop();
  }
});

test("benchmark timing measures execution and stays stopped after completion", async () => {
  mock.method(
    globalThis,
    "fetch",
    async () => new Response('{"version":2,"width":80,"height":24}\n[0,"o","test"]\n'),
  );

  const timings = [];
  const driver = benchmark(
    { url: "/benchmark.cast", iterations: 2 },
    {
      dispatch(name, payload) {
        if (name === "timing") timings.push(payload);
        if (name === "output") now += 100;
      },
    },
  );

  try {
    await driver.init();
    driver.play();
    expect(timings).toMatchObject([
      { time: 0, rate: 1 },
      { time: 0.4, rate: 0 },
    ]);

    now += 1000;
    expect(driver.getTiming()).toMatchObject({ time: 0.4, rate: 0 });
  } finally {
    driver.stop();
  }
});

test("wall clock publishes discrete HH:MM positions without extrapolation", () => {
  let date = new Date(2026, 0, 1, 14, 35);
  const nextMinute = new Date(2026, 0, 1, 14, 36);

  mock.method(globalThis, "Date", function () {
    return date;
  });

  const timings = [];
  const driver = wallClock(
    {},
    { dispatch: (name, payload) => name === "timing" && timings.push(payload) },
    {},
  );

  try {
    driver.init();
    expect(timings.at(-1)).toMatchObject({ time: 14 * 60 + 35, rate: 0 });

    now += 60000;
    expect(getTime(timings.at(-1))).toBe(14 * 60 + 35);

    date = nextMinute;
    driver.play();
    expect(timings.at(-1)).toMatchObject({ time: 14 * 60 + 36, rate: 0 });
    expect(driver.getTiming()).toEqual(timings.at(-1));
  } finally {
    driver.stop();
  }
});
