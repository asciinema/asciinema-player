import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await failOnPageError(page);
});

test("initializes successfully and mounts in DOM", async ({ page }) => {
  await createPlayer(page, "/assets/simple.cast");

  const created = await page.evaluate(() => window.player !== null);
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
  const playerApi = await createPlayer(page, "/assets/simple.cast");

  const startOverlay = page.locator(".ap-overlay-start");
  await expect(startOverlay).toBeVisible();

  await startOverlay.click();
  await playerApi.events.waitFor("playing");

  await expect(startOverlay).toBeHidden();
});

test("API play/pause emits play, playing, and pause events", async ({ page }) => {
  const playerApi = await createPlayer(page, "/assets/simple.cast");

  await playerApi.play();
  await playerApi.events.expectNext("play");
  await playerApi.events.expectNext("playing");

  await playerApi.pause();
  await playerApi.events.expectNext("pause");
});

test("API seek jumps to a marker index", async ({ page }) => {
  const playerApi = await createPlayer(page, "/assets/markers.cast");

  await playerApi.seek({ marker: 1 });

  await expectCurrentTime(playerApi).toBeCloseTo(1.1);
});

test("playback button toggles play/pause", async ({ page }) => {
  const playerApi = await createPlayer(page, "/assets/simple.cast");

  const playbackButton = page.locator(".ap-playback-button");
  await expect(playbackButton).toBeVisible();

  await playbackButton.click();
  await playerApi.events.waitFor("playing");

  await playbackButton.click();
  await playerApi.events.waitFor("pause");
});

test("progress bar click seeks to a new position", async ({ page }) => {
  const playerApi = await createPlayer(page, "/assets/simple.cast");

  await clickProgressBar(page, 0.75);
  await expectCurrentTime(playerApi).toBeCloseTo(9, 1);
});

test("emits input events during playback", async ({ page }) => {
  const playerApi = await createPlayer(page, "/assets/input.cast");

  await playerApi.play();

  const inputs = (await playerApi.events.collect())
    .filter((event) => event.name === "input")
    .map((event) => event.payload?.data);

  expect(inputs).toEqual(["a", "\r"]);
});

test("emits marker events during playback", async ({ page }) => {
  const playerApi = await createPlayer(page, "/assets/markers.cast");

  await playerApi.play();

  const markers = (await playerApi.events.collect())
    .filter((event) => event.name === "marker")
    .map((event) => event.payload);

  expect(markers).toEqual([
    { index: 0, label: "first", time: 0.5 },
    { index: 1, label: "second", time: 1.1 },
  ]);
});

test("autoplay starts playback without user interaction", async ({ page }) => {
  const playerApi = await createPlayer(page, "/assets/simple.cast", { autoPlay: true });
  await playerApi.events.waitFor("playing");
});

test("preload exposes duration before playback", async ({ page }) => {
  const playerApi = await createPlayer(page, "/assets/simple.cast", { preload: true });

  await expectDuration(playerApi).toBeGreaterThan(0);
});

test("startAt begins playback near the requested offset", async ({ page }) => {
  const playerApi = await createPlayer(page, "/assets/simple.cast", { startAt: 1 });

  await playerApi.play();
  await playerApi.events.waitFor("playing");
  const startTime = await playerApi.getCurrentTime();
  expect(startTime).toBeCloseTo(1.0, 1);
});

test("pauseOnMarkers pauses playback when a marker is reached", async ({ page }) => {
  const playerApi = await createPlayer(page, "/assets/markers.cast", { pauseOnMarkers: true });

  await playerApi.play();
  await playerApi.events.waitFor("playing");
  await playerApi.events.waitFor("marker");
  await playerApi.events.waitFor("pause");
  await expectCurrentTime(playerApi).toBeCloseTo(0.5);

  await page.waitForTimeout(200);
  const pausedTime = await playerApi.getCurrentTime();
  expect(pausedTime).toBeCloseTo(0.5);
});

test("loop option replays before ending", async ({ page }) => {
  const playerApi = await createPlayer(page, "/assets/loop.cast", { loop: 2 });

  await playerApi.play();
  await playerApi.events.waitFor("playing");
  await expectCurrentTime(playerApi).toBeGreaterThan(0.35);
  await expectCurrentTime(playerApi).toBeLessThan(0.15);
  await expectCurrentTime(playerApi).toBeGreaterThan(0.35);
  await playerApi.events.waitFor("ended");
});

test("resizes terminal view when the container changes size", async ({ page }) => {
  await createPlayer(page, "/assets/simple.cast");

  await setPlayerContainerSize(page, 800, 500);
  const terminal = page.locator(".ap-term");
  await terminal.waitFor();
  const initialBox = await terminal.boundingBox();
  expect(initialBox).not.toBeNull();

  await setPlayerContainerSize(page, 420, 320);
  await expect
    .poll(async () => (await terminal.boundingBox())?.width ?? 0)
    .toBeLessThan(initialBox.width - 20);
  await expect
    .poll(async () => (await terminal.boundingBox())?.height ?? 0)
    .toBeLessThan(initialBox.height - 20);
});

test("resizes terminal grid when the session window changes size", async ({ page }) => {
  const playerApi = await createPlayer(page, "/assets/resizing.cast");
  const terminal = page.locator(".ap-term");
  await terminal.waitFor();

  await expectTermSize(terminal, 80, 24);

  await playerApi.play();
  await expectTermSize(terminal, 100, 30);
  await expectTermSize(terminal, 50, 10);
});

test("keyboard space toggles play/pause", async ({ page }) => {
  const playerApi = await createPlayer(page, "/assets/simple.cast");
  await focusPlayer(page);

  await page.keyboard.press("Space");
  await playerApi.events.waitFor("playing");

  await page.keyboard.press("Space");
  await playerApi.events.waitFor("pause");
});

test("arrow key shortcuts seek by seconds and percentages", async ({ page }) => {
  const playerApi = await createPlayer(page, "/assets/long.cast");
  await focusPlayer(page);

  await page.keyboard.press("ArrowRight");
  await expectCurrentTime(playerApi).toBeGreaterThanOrEqual(4.5);

  await page.keyboard.press("Shift+ArrowRight");
  await expectCurrentTime(playerApi).toBeGreaterThanOrEqual(5.5);

  await page.keyboard.press("ArrowLeft");
  await expectCurrentTime(playerApi).toBeLessThanOrEqual(1.5);

  await page.keyboard.press("Shift+ArrowLeft");
  await expectCurrentTime(playerApi).toBeLessThanOrEqual(0.5);
});

test("keyboard seek shortcuts jump to markers and percentages", async ({ page }) => {
  const playerApi = await createPlayer(page, "/assets/markers.cast");
  await focusPlayer(page);

  await page.keyboard.press("]");
  await expectCurrentTime(playerApi).toBeCloseTo(0.5);

  await page.keyboard.press("]");
  await expectCurrentTime(playerApi).toBeCloseTo(1.1);

  await page.keyboard.press("[");
  await expectCurrentTime(playerApi).toBeCloseTo(0.5);

  await page.keyboard.press("5");
  await expectCurrentTime(playerApi).toBeCloseTo(1.0);
});

test("help overlay toggles with keyboard shortcuts", async ({ page }) => {
  await createPlayer(page, "/assets/simple.cast");
  await focusPlayer(page);
  const helpOverlay = page.locator(".ap-overlay-help");

  await page.keyboard.press("?");
  await expect(helpOverlay).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(helpOverlay).toBeHidden();

  await page.keyboard.press("?");
  await expect(helpOverlay).toBeVisible();

  await page.keyboard.press("?");
  await expect(helpOverlay).toBeHidden();
});

const PLAYER_EVENTS = ["play", "playing", "pause", "ended", "input", "marker"];

async function createPlayer(page, src, opts = {}) {
  await page.goto("/index.html");
  await page.evaluate(
    ({ src, opts, eventNames }) => {
      window.__events = [];
      window.__eventWaiters = [];
      window.__pushEvent = (event) => {
        window.__events.push(event);

        if (!window.__eventWaiters.length) return;

        const pending = [];

        for (const waiter of window.__eventWaiters) {
          if (window.__events.length > waiter.index) {
            waiter.resolve(window.__events[waiter.index]);
          } else {
            pending.push(waiter);
          }
        }

        window.__eventWaiters = pending;
      };

      window.player = AsciinemaPlayer.create(src, document.getElementById("player"), opts);

      eventNames.forEach((name) => {
        window.player.addEventListener(name, (payload) => {
          window.__pushEvent({ name, payload: payload ?? null });
        });
      });
    },
    { src, opts, eventNames: PLAYER_EVENTS },
  );

  const events = createEventStream(page);

  return {
    events,
    play: () => page.evaluate(() => window.player.play()),
    pause: () => page.evaluate(() => window.player.pause()),
    seek: (where) => page.evaluate((where) => window.player.seek(where), where),
    getCurrentTime: () => page.evaluate(() => window.player.getCurrentTime()),
    getDuration: () => page.evaluate(() => window.player.getDuration()),
  };
}

function createEventStream(page) {
  let index = 0;

  return {
    async next() {
      const event = await page.evaluate((index) => {
        return new Promise((resolve) => {
          const events = window.__events ?? [];

          if (events.length > index) {
            resolve(events[index]);
            return;
          }

          window.__eventWaiters = window.__eventWaiters ?? [];
          window.__eventWaiters.push({ index, resolve });
        });
      }, index);

      index += 1;
      return event;
    },

    async expectNext(name) {
      const event = await this.next();
      expect(event.name).toBe(name);
      return event;
    },

    async collect(predicate) {
      const shouldStop =
        typeof predicate === "function" ? predicate : (event) => event.name === "ended";
      const collected = [];

      while (true) {
        const event = await this.next();
        collected.push(event);
        if (shouldStop(event)) {
          return collected;
        }
      }
    },

    async waitFor(name) {
      while (true) {
        const event = await this.next();
        if (!name || event.name === name) {
          return event;
        }
      }
    },
  };
}

function expectCurrentTime(player) {
  return expect.poll(() => player.getCurrentTime(), { timeout: 1000 });
}

function expectDuration(player) {
  return expect.poll(() => player.getDuration(), { timeout: 1000 });
}

function expectTermSize(terminal, cols, rows) {
  return expect
    .poll(async () => {
      return await terminal.evaluate((node) => {
        const style = getComputedStyle(node);
        const cols = Number.parseInt(style.getPropertyValue("--term-cols"), 10);
        const rows = Number.parseInt(style.getPropertyValue("--term-rows"), 10);
        return { cols, rows };
      });
    })
    .toEqual({ cols, rows });
}

async function clickProgressBar(page, position) {
  const bar = page.locator(".ap-bar");
  await bar.waitFor();
  const box = await bar.boundingBox();
  expect(box).not.toBeNull();

  await bar.click({ position: { x: box.width * position, y: box.height / 2 } });
}

async function focusPlayer(page) {
  await page.evaluate(() => {
    document.querySelector(".ap-wrapper")?.focus();
  });
}

async function setPlayerContainerSize(page, width, height) {
  await page.evaluate(
    ({ width, height }) => {
      const container = document.getElementById("player");
      container.style.width = `${width}px`;
      container.style.height = `${height}px`;
    },
    { width, height },
  );
}

async function failOnPageError(page) {
  await page.addInitScript(() => {
    window.addEventListener("unhandledrejection", (event) => {
      setTimeout(() => {
        // Re-throw asynchronously so Firefox reports it via pageerror with a browser stack.
        throw event.reason;
      });
    });
  });

  page.on("pageerror", (error) => {
    throw error;
  });
  page.on("crash", () => {
    throw new Error("Page crashed.");
  });
}
