import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import init, { create } from "../../src/vt/target/rollup-plugin-rust/vt_js/index.js";

// Exercise the actual bindings produced by npm run build.
let terminals = [];

test.beforeAll(async () => {
  const bytes = await readFile(
    new URL("../../src/vt/target/rollup-plugin-rust/vt_js/index_bg.wasm", import.meta.url),
  );

  await init({ module_or_path: bytes });
});

test.afterEach(() => {
  for (const vt of terminals) {
    vt.free();
  }

  terminals = [];
});

test("WASM feed returns JavaScript row arrays and reuses its observer", () => {
  const vt = terminal(8, 3);

  expect(vt.feed("a")).toEqual([0, 1, 2]);
  expect(vt.feed("b")).toEqual([0]);
});

test("WASM resize exports changed rows and updated dimensions", () => {
  const vt = terminal(8, 3);
  vt.feed("");

  expect(vt.resize(4, 2)).toEqual([0, 1]);
  expect(Array.from(vt.getSize())).toEqual([4, 2]);
});

test("WASM cursor exports a coordinate pair or undefined when hidden", () => {
  const vt = terminal(4, 2);
  vt.feed("\x1b[2;3H");

  expect(vt.getCursor()).toEqual([2, 1]);

  vt.feed("\x1b[?25l");
  expect(vt.getCursor()).toBeUndefined();
});

test("WASM construction rejects zero dimensions with JavaScript errors", () => {
  for (const [cols, rows] of [
    [0, 3],
    [8, 0],
  ]) {
    expect(() => create(cols, rows, 100, true)).toThrow(
      new Error(`invalid terminal size ${cols}x${rows}: columns and rows must be positive`),
    );
  }
});

function terminal(cols, rows) {
  const vt = create(cols, rows, 100, true);
  terminals.push(vt);

  return vt;
}
