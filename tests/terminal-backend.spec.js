import { test, expect } from "@playwright/test";

test("external terminal receives reset, output and resize in replay order", async ({ page }) => {
  await page.goto("/index.html");
  await page.evaluate(() => {
    window.calls = [];
    window.player = AsciinemaPlayer.create(
      { data: [{ version: 2, width: 12, height: 3 }, [0, "o", "e"],
        [0.1, "o", "\u0301"], [0.2, "r", "20x4"], [0.3, "o", "👩🏽‍💻"], [1, "o", "end"]] },
      document.getElementById("player"),
      { terminalBackend: async ({ element }) => {
        element.textContent = "External terminal";
        return {
          reset: (state) => calls.push(["reset", state.size]),
          write: (text) => calls.push(["write", text]),
          resize: (size) => calls.push(["resize", size]),
          update: () => {},
          present: () => calls.push(["present"]),
          dispose: () => calls.push(["dispose"]),
        };
      } },
    );
  });
  await expect(page.getByText("External terminal", { exact: true })).toBeVisible();
  await page.evaluate(() => player.seek(0.5));
  const calls = await page.evaluate(() => calls.filter(([name]) => name !== "present"));
  expect(calls).toContainEqual(["resize", { cols: 20, rows: 4 }]);
  expect(calls.filter(([name]) => name === "write").map(([, text]) => text).join(""))
    .toContain("e\u0301👩🏽‍💻");
  await page.evaluate(async () => { calls.length = 0; await player.seek(0); });
  expect(await page.evaluate(() => calls)).toContainEqual(["reset", { cols: 12, rows: 3 }]);
  await page.evaluate(() => player.dispose());
  expect(await page.evaluate(() => calls.filter(([name]) => name === "dispose").length)).toBe(1);
});

test("disposes a backend that finishes initializing after the player is removed", async ({ page }) => {
  await page.goto("/index.html");
  await page.evaluate(() => {
    window.disposed = 0;
    window.player = AsciinemaPlayer.create("/assets/simple.cast", document.getElementById("player"), {
      terminalBackend: () => new Promise((resolve) => { window.finish = () => resolve({
        write() {}, reset() {}, resize() {}, update() {}, present() {},
        dispose() { window.disposed++; },
      }); }),
    });
  });
  await expect.poll(() => page.evaluate(() => typeof window.finish)).toBe("function");
  await page.evaluate(() => { player.dispose(); finish(); });
  await expect.poll(() => page.evaluate(() => window.disposed)).toBe(1);
});

test("backend initialization failure rejects playback and emits an error", async ({ page }) => {
  await page.goto("/index.html");
  const result = await page.evaluate(async () => {
    const player = AsciinemaPlayer.create("/assets/simple.cast", document.getElementById("player"), {
      terminalBackend: async () => { throw new Error("backend unavailable"); },
    });
    let error;
    player.addEventListener("error", (e) => { error = e.message; });
    try { await player.play(); } catch (e) { return [error, e.message]; }
  });
  expect(result).toEqual(["backend unavailable", "backend unavailable"]);
});
