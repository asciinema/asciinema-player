import { test, expect } from "@playwright/test";
import parseTypescript from "../../src/parser/typescript.js";

test("parses classic typescript timing and data files", async () => {
  const header = 'Script started COLUMNS="90" LINES="30"\n';
  const output = `${header}hello żółć`;

  const recording = await parseTypescript([new Response("0.5 5\n0.2 9\n"), new Response(output)], {
    encoding: "utf-8",
  });

  expect(recording.cols).toBe(90);
  expect(recording.rows).toBe(30);

  expect(recording.events).toEqual([
    [0.5, "o", "hello"],
    [0.7, "o", " żółć"],
  ]);
});

test("parses advanced typescript format with input and resize events", async () => {
  const header = 'Script started COLUMNS="80" LINES="24"\n';
  const output = `${header}żółć!`;
  const input = `${header}a`;

  const timing = [
    "H 0.0 COLUMNS 100",
    "H 0.0 LINES 40",
    "O 0.5 8",
    "I 0.2 1",
    "S 0.3 SIGWINCH ROWS=50 COLS=120",
    "O 0.1 1",
    "",
  ].join("\n");

  const recording = await parseTypescript(
    [new Response(timing), new Response(output), new Response(input)],
    { encoding: "utf-8" },
  );

  expect(recording.cols).toBe(100);
  expect(recording.rows).toBe(40);

  expect(recording.events).toEqual([
    [0.5, "o", "żółć"],
    [0.7, "i", "a"],
    [1.0, "r", "120x50"],
    [1.1, "o", "!"],
  ]);
});
