import { test, expect } from "@playwright/test";
import parseAsciicast from "../../src/parser/asciicast.js";

test("parses asciicast v1 minimal Response input", async () => {
  const recording = await parseAsciicast(
    new Response('{\n  "version": 1,\n  "width": 0,\n  "height": 0,\n  "stdout": []\n}'),
  );

  expect(recording.cols).toBe(80);
  expect(recording.rows).toBe(24);
  expect(Array.from(recording.events)).toEqual([]);
});

test("parses asciicast v1 full object input", async () => {
  const recording = await parseAsciicast({
    version: 1,
    width: 100,
    height: 30,
    stdout: [
      [1.0, "hello "],
      [0.5, "world"],
    ],
  });

  expect(recording.cols).toBe(100);
  expect(recording.rows).toBe(30);

  expect(Array.from(recording.events)).toEqual([
    [1, "o", "hello "],
    [1.5, "o", "world"],
  ]);
});

test("parses asciicast v2 minimal Response input", async () => {
  const recording = await parseAsciicast(
    new Response([JSON.stringify({ version: 2, width: 0, height: 0 }), ""].join("\n")),
  );

  expect(recording.cols).toBe(80);
  expect(recording.rows).toBe(24);
  expect(recording.theme).toBeUndefined();
  expect(Array.from(recording.events)).toEqual([]);
});

test("parses asciicast v2 full direct input", async () => {
  const recording = await parseAsciicast([
    {
      version: 2,
      width: 100,
      height: 30,
      idle_time_limit: 2,
      theme: {
        fg: "#ffffff",
        bg: "#000000",
        palette:
          "#111111:#222222:#333333:#444444:#555555:#666666:#777777:#888888:#999999:#aaaaaa:#bbbbbb:#cccccc:#dddddd:#eeeeee:#fafafa:#010101",
      },
    },
    [1.0, "o", "hello"],
    [2.0, "m", "chapter"],
  ]);

  expect(recording.cols).toBe(100);
  expect(recording.rows).toBe(30);
  expect(recording.idleTimeLimit).toBe(2);
  expect(recording.theme.foreground).toBe("#ffffff");
  expect(recording.theme.background).toBe("#000000");
  expect(recording.theme.palette).toHaveLength(16);

  expect(Array.from(recording.events)).toEqual([
    [1, "o", "hello"],
    [2, "m", "chapter"],
  ]);
});

test("parses asciicast v3 minimal Response input", async () => {
  const recording = await parseAsciicast(
    new Response([JSON.stringify({ version: 3, term: { cols: 0, rows: 0 } }), ""].join("\n")),
  );

  expect(recording.cols).toBe(80);
  expect(recording.rows).toBe(24);
  expect(recording.theme).toBeUndefined();
  expect(Array.from(recording.events)).toEqual([]);
});

test("parses asciicast v3 full direct input", async () => {
  const recording = await parseAsciicast([
    {
      version: 3,
      term: {
        cols: 90,
        rows: 40,
        theme: {
          fg: "#eeeeee",
          bg: "#111111",
          palette:
            "#000000:#111111:#222222:#333333:#444444:#555555:#666666:#777777:#888888:#999999:#aaaaaa:#bbbbbb:#cccccc:#dddddd:#eeeeee:#ffffff",
        },
      },
      idle_time_limit: 3,
    },
    [1.0, "o", "hello"],
    [0.5, "i", "a"],
    [0.25, "m", "marker"],
  ]);

  expect(recording.cols).toBe(90);
  expect(recording.rows).toBe(40);
  expect(recording.idleTimeLimit).toBe(3);
  expect(recording.theme.foreground).toBe("#eeeeee");
  expect(recording.theme.background).toBe("#111111");
  expect(recording.theme.palette).toHaveLength(16);

  expect(Array.from(recording.events)).toEqual([
    [1, "o", "hello"],
    [1.5, "i", "a"],
    [1.75, "m", "marker"],
  ]);
});

test("rejects invalid asciicast data", async () => {
  await expect(parseAsciicast("nope")).rejects.toThrow("invalid data");
});
