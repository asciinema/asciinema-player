import { test, expect } from "@playwright/test";
import { parseNpt, debounce, throttle } from "../../src/util.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const nptCases = [
  ["number", 12.5, 12.5],
  ["seconds", "25", 25],
  ["fractional seconds", "1.5", 1.5],
  ["minutes and seconds", "1:30", 90],
  ["hours, minutes and seconds", "01:02:03", 3723],
  ["fractional component", "1:30.5", 90.5],
  ["null", null, undefined],
  ["undefined", undefined, undefined],
];

for (const [name, input, expected] of nptCases) {
  test(`parseNpt handles ${name}`, () => {
    expect(parseNpt(input)).toBe(expected);
  });
}

test("debounce collapses rapid calls into the last one", async () => {
  const calls = [];
  const f = debounce((x) => calls.push(x), 20);

  f(1);
  f(2);
  f(3);
  await sleep(60);

  expect(calls).toEqual([3]);
});

test("debounce fires again for calls after the delay", async () => {
  const calls = [];
  const f = debounce((x) => calls.push(x), 20);

  f(1);
  await sleep(60);
  f(2);
  await sleep(60);

  expect(calls).toEqual([1, 2]);
});

test("throttle drops calls made within the interval", async () => {
  const calls = [];
  const f = throttle((x) => calls.push(x), 30);

  f(1);
  f(2);
  f(3);
  await sleep(60);
  f(4);

  expect(calls).toEqual([1, 4]);
});
