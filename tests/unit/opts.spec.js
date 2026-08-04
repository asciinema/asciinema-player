import { test, expect } from "@playwright/test";
import { coreOpts, uiOpts } from "../../src/opts.js";

test("coreOpts keeps only known core options", () => {
  const opts = coreOpts({ speed: 2, theme: "dracula", bogus: 1 });

  expect(opts.speed).toBe(2);
  expect(opts.theme).toBeUndefined();
  expect(opts.bogus).toBeUndefined();
});

test("uiOpts keeps only known UI options", () => {
  const opts = uiOpts({ theme: "dracula", markers: [[1, "intro"]], bogus: 1 });

  expect(opts.theme).toBe("dracula");
  expect(opts.markers).toBeUndefined();
  expect(opts.bogus).toBeUndefined();
});

const nullishCases = [
  ["null", null],
  ["undefined", undefined],
];

for (const [name, value] of nullishCases) {
  test(`coreOpts treats ${name} option values as absent`, () => {
    const opts = coreOpts({ markers: value, poster: value, startAt: value, speed: value });

    expect("markers" in opts).toBe(false);
    expect("poster" in opts).toBe(false);
    expect("startAt" in opts).toBe(false);
    expect(opts.speed).toBe(1.0);
  });

  test(`uiOpts treats ${name} option values as absent`, () => {
    const opts = uiOpts({ theme: value, fit: value, cursorMode: value });

    expect("theme" in opts).toBe(false);
    expect("fit" in opts).toBe(false);
    expect(opts.cursorMode).toBe("blinking");
  });
}

test("coreOpts defaults speed to 1.0", () => {
  expect(coreOpts({}).speed).toBe(1.0);
});

test("coreOpts maps autoplay alias to autoPlay", () => {
  expect(coreOpts({ autoplay: true }).autoPlay).toBe(true);
  expect(coreOpts({ autoplay: false, autoPlay: true }).autoPlay).toBe(true);
});

test("coreOpts normalizes markers into [time, label] pairs", () => {
  expect(coreOpts({ markers: [[1, "intro"], 2.5] }).markers).toEqual([
    [1, "intro"],
    [2.5, ""],
  ]);
});

test("coreOpts copies the markers array", () => {
  const markers = [[1, "intro"]];
  const opts = coreOpts({ markers });

  markers.push(2);
  markers[0][1] = "changed";

  expect(opts.markers).toEqual([[1, "intro"]]);
});

const invalidMarkersCases = [
  ["a string", "0:12"],
  ["a number", 5],
  ["an object", { 1: "intro" }],
];

for (const [name, value] of invalidMarkersCases) {
  test(`coreOpts rejects markers given as ${name}`, () => {
    expect(() => coreOpts({ markers: value })).toThrow(/markers option must be an array/);
  });
}

const invalidMarkerEntryCases = [
  ["null", [null]],
  ["a string", ["0:12"]],
  ["NaN", [NaN]],
  ["a pair with a missing label", [[1]]],
  ["a pair with a non-string label", [[1, 42]]],
  ["a pair with a non-numeric time", [["1", "intro"]]],
];

for (const [name, value] of invalidMarkerEntryCases) {
  test(`coreOpts rejects a marker entry given as ${name}`, () => {
    expect(() => coreOpts({ markers: value })).toThrow(/invalid marker at index 0/);
  });
}

const invalidSpeedCases = [
  ["a string", "2"],
  ["zero", 0],
  ["negative", -1],
  ["NaN", NaN],
  ["Infinity", Infinity],
];

for (const [name, value] of invalidSpeedCases) {
  test(`coreOpts rejects speed given as ${name}`, () => {
    expect(() => coreOpts({ speed: value })).toThrow(/speed option must be a positive number/);
  });
}

test("coreOpts reports the offending speed value", () => {
  expect(() => coreOpts({ speed: Infinity })).toThrow(/got: Infinity/);
  expect(() => coreOpts({ speed: "2" })).toThrow(/got: "2"/);
});

test("uiOpts rejects unsupported cursor mode", () => {
  expect(() => uiOpts({ cursorMode: "wobbly" })).toThrow(/unsupported cursor mode/);
});

test("uiOpts rejects non-boolean keystroke overlay", () => {
  expect(() => uiOpts({ keystrokeOverlay: "yes" })).toThrow(/unsupported keystroke overlay/);
});

test("overrides win over input options", () => {
  expect(coreOpts({ speed: 2 }, { speed: 3 }).speed).toBe(3);
  expect(uiOpts({ theme: "dracula" }, { theme: "solarized" }).theme).toBe("solarized");
});
