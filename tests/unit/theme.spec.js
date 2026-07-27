import { test, expect } from "@playwright/test";
import { normalizeTheme } from "../../src/theme.js";

const palette8 = [
  "#000000",
  "#aa0000",
  "#00aa00",
  "#aaaa00",
  "#0000aa",
  "#aa00aa",
  "#00aaaa",
  "#aaaaaa",
];

const palette16 = [
  ...palette8,
  "#555555",
  "#ff5555",
  "#55ff55",
  "#ffff55",
  "#5555ff",
  "#ff55ff",
  "#55ffff",
  "#ffffff",
];

const theme = (overrides = {}) => ({
  foreground: "#dddddd",
  background: "#111111",
  palette: palette16,
  ...overrides,
});

test("normalizes a complete 16-color theme", () => {
  expect(normalizeTheme(theme())).toEqual({
    foreground: "#dddddd",
    background: "#111111",
    palette: palette16,
  });
});

test("extends an 8-color palette to 16 by repeating it", () => {
  const result = normalizeTheme(theme({ palette: palette8 }));

  expect(result.palette).toEqual([...palette8, ...palette8]);
});

test("fills a partial bright half from the dim half", () => {
  const palette12 = palette16.slice(0, 12);
  const result = normalizeTheme(theme({ palette: palette12 }));

  expect(result.palette).toEqual([...palette12, ...palette16.slice(4, 8)]);
});

test("ignores palette entries beyond 16", () => {
  const result = normalizeTheme(theme({ palette: [...palette16, "#123456"] }));

  expect(result.palette).toEqual(palette16);
});

test("normalizes color notation in all fields", () => {
  const result = normalizeTheme(
    theme({ foreground: " #DDD", background: "#111", palette: ["#A00", ...palette8.slice(1)] }),
  );

  expect(result.foreground).toBe("#dddddd");
  expect(result.background).toBe("#111111");
  expect(result.palette[0]).toBe("#aa0000");
});

const rejectedCases = [
  ["a missing palette", { palette: undefined }],
  ["a palette shorter than 8", { palette: palette8.slice(0, 7) }],
  ["an invalid palette entry", { palette: ["nope", ...palette8.slice(1)] }],
  ["an invalid foreground", { foreground: "red" }],
  ["an invalid background", { background: "#12345" }],
];

for (const [name, overrides] of rejectedCases) {
  test(`returns undefined for ${name}`, () => {
    expect(normalizeTheme(theme(overrides))).toBeUndefined();
  });
}
