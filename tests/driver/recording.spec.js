import { test, expect } from "@playwright/test";
import recording from "../../src/driver/recording.js";

test("step advances across multiple output frames", async () => {
  const output = [];

  const driver = recording(
    {
      data: {
        cols: 80,
        rows: 24,
        events: [
          [0.1, "o", "start\r\n"],
          [1.0, "o", "one\r\n"],
          [2.0, "o", "two\r\n"],
        ],
      },
      parser: (data) => data,
    },
    {
      feed: (data) => output.push(data),
      reset: () => {},
      resize: () => {},
      logger: stubLogger(),
      dispatch: () => {},
    },
    { speed: 1 },
  );

  await driver.step(2);

  expect(driver.getCurrentTime()).toBeCloseTo(1.0);
  expect(output.join("")).toContain("start");
  expect(output.join("")).toContain("one");
  expect(output.join("")).not.toContain("two");
});

function stubLogger() {
  return {
    debug() {},
    warn() {},
  };
}
