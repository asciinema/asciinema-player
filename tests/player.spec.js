import { test, expect } from "@playwright/test";

test("initializes successfully and mounts in DOM", async ({ page }) => {
  await page.goto("/index.html");

  const created = await createPlayer(page, "/assets/simple.cast");
  expect(created).toBe(true);

  const player = page.locator(".ap-player");
  await expect(player).toBeVisible();

  const terminal = page.locator(".ap-term");
  await expect(terminal).toBeVisible();

  const controlBar = page.locator(".ap-control-bar");
  await expect(controlBar).toBeVisible();

  const hasApiMethods = await page.evaluate(() => {
    const player = window.player;

    return (
      typeof player.play === "function" &&
      typeof player.pause === "function" &&
      typeof player.seek === "function" &&
      typeof player.getCurrentTime === "function" &&
      typeof player.getDuration === "function" &&
      typeof player.dispose === "function"
    );
  });

  expect(hasApiMethods).toBe(true);
});

test("starts playback when start overlay is clicked", async ({ page }) => {
  await page.goto("/index.html");

  await createPlayer(page, "/assets/simple.cast");

  await page.evaluate(() => {
    let onPlaying;

    window.playing = new Promise((resolve) => {
      onPlaying = resolve;
    });

    window.player.addEventListener("playing", onPlaying);
  });

  const startOverlay = page.locator(".ap-overlay-start");
  await expect(startOverlay).toBeVisible();

  await startOverlay.click();

  await page.evaluate(async () => {
    await window.playing;
  });
});

async function createPlayer(page, src, opts = {}) {
  return await page.evaluate(
    ({ src, opts }) => {
      window.player = AsciinemaPlayer.create(src, document.getElementById("player"), opts);
      return window.player !== null;
    },
    { src, opts },
  );
}
