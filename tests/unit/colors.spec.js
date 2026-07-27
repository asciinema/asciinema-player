import { test, expect } from "@playwright/test";
import {
  normalizeHexColor,
  lerpOklab,
  hexToOklab,
  oklabToHex,
  rgbToHex,
} from "../../src/colors.js";

const normalizeCases = [
  ["full hex", "#aabbcc", "#aabbcc"],
  ["uppercase", "#AABBCC", "#aabbcc"],
  ["surrounding whitespace", "  #aabbcc ", "#aabbcc"],
  ["short hex", "#abc", "#aabbcc"],
  ["short uppercase hex", "#A1F", "#aa11ff"],
  ["missing hash", "aabbcc", undefined],
  ["truncated hex", "#aabbc", undefined],
  ["non-hex digits", "#gghhii", undefined],
  ["null", null, undefined],
];

for (const [name, input, expected] of normalizeCases) {
  test(`normalizeHexColor handles ${name}`, () => {
    expect(normalizeHexColor(input)).toBe(expected);
  });
}

test("normalizeHexColor returns the fallback for invalid input", () => {
  expect(normalizeHexColor("nope", "#000000")).toBe("#000000");
  expect(normalizeHexColor(undefined, "#ffffff")).toBe("#ffffff");
});

test("rgbToHex formats channel values", () => {
  expect(rgbToHex(255, 0, 128)).toBe("#ff0080");
  expect(rgbToHex(0, 0, 0)).toBe("#000000");
});

test("rgbToHex rounds fractional channel values", () => {
  expect(rgbToHex(127.4, 127.5, 127.6)).toBe("#7f8080");
});

test("rgbToHex clamps out-of-range channel values", () => {
  expect(rgbToHex(300, -20, 12)).toBe("#ff000c");
});

test("hexToOklab converts primaries to reference values", () => {
  const [l, a, b] = hexToOklab("#ff0000");

  expect(l).toBeCloseTo(0.627955, 5);
  expect(a).toBeCloseTo(0.224863, 5);
  expect(b).toBeCloseTo(0.125846, 5);
});

test("hexToOklab converts black and white to the lightness extremes", () => {
  expect(hexToOklab("#000000")).toEqual([0, 0, 0]);

  const [l, a, b] = hexToOklab("#ffffff");

  expect(l).toBeCloseTo(1, 6);
  expect(a).toBeCloseTo(0, 6);
  expect(b).toBeCloseTo(0, 6);
});

test("oklabToHex round-trips in-gamut colors", () => {
  for (const color of ["#000000", "#ffffff", "#ff0000", "#336699", "#8a2be2"]) {
    expect(oklabToHex(hexToOklab(color))).toBe(color);
  }
});

test("oklabToHex maps out-of-gamut chroma back to the gamut boundary", () => {
  const red = hexToOklab("#ff0000");
  const oversaturatedRed = [red[0], red[1] * 2, red[2] * 2];

  expect(oklabToHex(oversaturatedRed)).toBe("#ff0000");
});

test("oklabToHex clamps out-of-range lightness", () => {
  expect(oklabToHex([1.5, 0, 0])).toBe("#ffffff");
  expect(oklabToHex([-0.5, 0, 0])).toBe("#000000");
});

test("lerpOklab interpolates componentwise", () => {
  const c1 = [0, 0, 0];
  const c2 = [1, -1, 2];

  expect(lerpOklab(0, c1, c2)).toEqual(c1);
  expect(lerpOklab(1, c1, c2)).toEqual(c2);
  expect(lerpOklab(0.5, c1, c2)).toEqual([0.5, -0.5, 1]);
});
