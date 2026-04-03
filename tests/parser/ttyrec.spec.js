import { test, expect } from "@playwright/test";
import parseTtyrec from "../../src/parser/ttyrec.js";

test("parses ttyrec frames and terminal size", async () => {
  const data = concatArrays([frame(1, "\x1b[8;30;100t"), frame(1.5, "żółć")]);

  const recording = await parseTtyrec(new Response(data), { encoding: "utf-8" });

  expect(recording.cols).toBe(100);
  expect(recording.rows).toBe(30);

  expect(recording.events).toEqual([
    [0, "o", "\x1b[8;30;100t"],
    [0.5, "o", "żółć"],
  ]);
});

test("falls back to default size when ttyrec frame has no resize sequence", async () => {
  const recording = await parseTtyrec(new Response(frame(5, "żółć")), { encoding: "utf-8" });

  expect(recording.cols).toBe(80);
  expect(recording.rows).toBe(24);
  expect(recording.events).toEqual([[0, "o", "żółć"]]);
});

function frame(time, text) {
  const data = new TextEncoder().encode(text);
  const sec = Math.floor(time);
  const usec = Math.round((time - sec) * 1000000);
  const header = new Uint8Array(12);
  const view = new DataView(header.buffer);
  view.setUint32(0, sec, true);
  view.setUint32(4, usec, true);
  view.setUint32(8, data.length, true);

  return concatArrays([header, data]);
}

function concatArrays(arrays) {
  const size = arrays.reduce((sum, array) => sum + array.length, 0);
  const result = new Uint8Array(size);
  let offset = 0;

  for (const array of arrays) {
    result.set(array, offset);
    offset += array.length;
  }

  return result;
}
