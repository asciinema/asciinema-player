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

  const startTime = Date.now();

  await playerApi.play();
  await playerApi.events.waitFor("playing");
  const duration = await playerApi.getDuration();
  expect(duration).toBeGreaterThan(0);
  await playerApi.events.waitFor("ended");
  const elapsed = (Date.now() - startTime) / 1000;

  // Use a loose lower bound to avoid timer throttling flakiness in Firefox.
  expect(elapsed).toBeGreaterThan(duration * 1.5);
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

test("bold+inverse brightens indexed fg when boldIsBright=true", async ({ page }) => {
  const playerApi = await createPlayer(page, "/assets/bold-inverse-indexed.cast", {
    autoPlay: true,
    boldIsBright: true,
    theme: "tango",
  });

  await playerApi.events.waitFor("ended");

  const { cells } = await sampleTerminalPixels(page, { cells: [[0, 0, 0.5, 0.5]] });

  expect(cells[0]).toBe("#8ae234");
});

test("bold+inverse keeps indexed fg when boldIsBright=false", async ({ page }) => {
  const playerApi = await createPlayer(page, "/assets/bold-inverse-indexed.cast", {
    autoPlay: true,
    boldIsBright: false,
    theme: "tango",
  });

  await playerApi.events.waitFor("ended");

  const { cells } = await sampleTerminalPixels(page, { cells: [[0, 0, 0.5, 0.5]] });

  expect(cells[0]).toBe("#4e9a06");
});

test("RGB color rendering", async ({ page }) => {
  const playerApi = await createPlayer(page, "/assets/rgb.cast", {
    autoPlay: true,
  });

  await playerApi.events.waitFor("ended");

  const { cells } = await sampleTerminalPixels(page, {
    cells: [
      [0, 0, 0.9, 0.1],
      [0, 0, 0.5, 0.5],
      [0, 1, 0.9, 0.1],
      [0, 1, 0.5, 0.5],
      [0, 2, 0.9, 0.1],
      [0, 2, 0.5, 0.5],
    ],
  });

  expect(cells[0]).toBe("#123456");
  expect(cells[1]).toBe("#fedcba");
  expect(cells[2]).toBe("#123456");
  expect(cells[3]).toBe("#fedcba");
  expect(cells[4]).toBe("#123456");
  expect(cells[5]).toBe("#fedcba");
});

test("automatic embedded theme", async ({ page }) => {
  const playerApi = await createPlayer(page, "/assets/theme.cast", {
    autoPlay: true,
  });

  await playerApi.events.waitFor("ended");

  const embeddedTheme = {
    fg: "#fafafa",
    bg: "#bababa",
    palette: [
      "#000000",
      "#111111",
      "#222222",
      "#333333",
      "#444444",
      "#555555",
      "#666666",
      "#777777",
      "#888888",
      "#999999",
      "#aaaaaa",
      "#bbbbbb",
      "#cccccc",
      "#dddddd",
      "#eeeeee",
      "#ffffff",
    ],
  };

  const expectedColors = buildThemeSamples(embeddedTheme);

  const { cells, border } = await sampleTerminalPixels(page, {
    cells: expectedColors,
    border: true,
  });

  expect(border).toBe("#bababa");

  for (let i = 0; i < expectedColors.length; i += 1) {
    expect(cells[i]).toBe(expectedColors[i][4]);
  }
});

test("fixed 256 color palette by default", async ({ page }) => {
  const playerApi = await createPlayer(page, "/assets/theme-256.cast", {
    autoPlay: true,
  });

  await playerApi.events.waitFor("ended");

  const expectedColors = [
    "#000000", // 16
    "#0000ff", // 21
    "#00ff00", // 46
    "#00ffff", // 51
    "#ff0000", // 196
    "#ff00ff", // 201
    "#ffff00", // 226
    "#ffffff", // 231
    "#878787", // 102
    "#afafaf", // 145
    "#080808", // 232
    "#767676", // 243
    "#eeeeee", // 255
  ];

  const samples = [];

  for (let col = 0; col < expectedColors.length; col += 1) {
    samples.push([0, col, 0.5, 0.5, expectedColors[col]]);
    samples.push([1, col, 0.5, 0.5, expectedColors[col]]);
  }

  const { cells } = await sampleTerminalPixels(page, { cells: samples });

  for (let i = 0; i < samples.length; i += 1) {
    expect(cells[i]).toBe(samples[i][4]);
  }
});

test("generated 256 color palette with adaptivePalette enabled", async ({ page }) => {
  const playerApi = await createPlayer(page, "/assets/theme-256.cast", {
    autoPlay: true,
    adaptivePalette: true,
  });

  await playerApi.events.waitFor("ended");

  const expectedColors = [
    "#282a36", // 16
    "#bd93f9", // 21
    "#50fa7b", // 46
    "#8be9fd", // 51
    "#ff5555", // 196
    "#ff79c6", // 201
    "#f1fa8c", // 226
    "#f8f8f2", // 231
    "#ab9c99", // 102
    "#d1c1bc", // 145
    "#2f313d", // 232
    "#84868b", // 243
    "#efefea", // 255
  ];

  const samples = [];

  for (let col = 0; col < expectedColors.length; col += 1) {
    samples.push([0, col, 0.5, 0.5, expectedColors[col]]);
    samples.push([1, col, 0.5, 0.5, expectedColors[col]]);
  }

  const { cells } = await sampleTerminalPixels(page, { cells: samples });

  for (let i = 0; i < samples.length; i += 1) {
    expect(cells[i]).toBe(samples[i][4]);
  }
});

test("explicit theme", async ({ page }) => {
  const playerApi = await createPlayer(page, "/assets/theme.cast", {
    autoPlay: true,
    theme: "dracula",
  });

  await playerApi.events.waitFor("ended");

  const draculaTheme = {
    fg: "#f8f8f2",
    bg: "#282a36",
    palette: [
      "#21222c",
      "#ff5555",
      "#50fa7b",
      "#f1fa8c",
      "#bd93f9",
      "#ff79c6",
      "#8be9fd",
      "#f8f8f2",
      "#6272a4",
      "#ff6e6e",
      "#69ff94",
      "#ffffa5",
      "#d6acff",
      "#ff92df",
      "#a4ffff",
      "#ffffff",
    ],
  };

  const expectedColors = buildThemeSamples(draculaTheme);

  const { cells, border } = await sampleTerminalPixels(page, {
    cells: expectedColors,
    border: true,
  });

  expect(border).toBe("#282a36");

  for (let i = 0; i < expectedColors.length; i += 1) {
    expect(cells[i]).toBe(expectedColors[i][4]);
  }
});

test("poster - npt", async ({ page }) => {
  await createPlayer(page, "/assets/long.cast", {
    poster: "npt:7",
  });

  await page.waitForTimeout(500);

  await expectTermText(page, ["start", "one", "six"]);
});

test("poster - data:text/plain", async ({ page }) => {
  await createPlayer(page, "/assets/long.cast", {
    poster: "data:text/plain,hello world",
  });

  await page.waitForTimeout(500);

  await expectTermText(page, "hello world");
});

test("poster - data:text/plain - with preload", async ({ page }) => {
  await createPlayer(page, "/assets/long.cast", {
    poster: "data:text/plain,hello world",
    preload: true,
  });

  await page.waitForTimeout(500);

  await expectTermText(page, "hello world");
});

const PLAYER_EVENTS = ["play", "playing", "pause", "ended", "input", "marker"];

async function createPlayer(page, src, opts = {}) {
  await page.goto("/index.html");
  await page.evaluate(
    ({ src, opts, eventNames }) => {
      window.__events = [];
      window.__eventIndex = 0;
      window.__eventWaiter = null;
      window.__pushEvent = (event) => {
        window.__events.push(event);

        if (window.__eventWaiter) {
          const resolve = window.__eventWaiter;
          window.__eventWaiter = null;
          resolve(window.__events[window.__eventIndex]);
          window.__eventIndex += 1;
        }
      };
      window.__nextEvent = () => {
        if (window.__events.length > window.__eventIndex) {
          const event = window.__events[window.__eventIndex];
          window.__eventIndex += 1;
          return Promise.resolve(event);
        }

        return new Promise((resolve) => {
          window.__eventWaiter = resolve;
        });
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
  return {
    async next() {
      return await page.evaluate(() => window.__nextEvent());
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

function expectCurrentTime(player, timeout = 1000) {
  return expect.poll(() => player.getCurrentTime(), { timeout });
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

async function expectTermText(page, fragments, timeout = 1000) {
  const termText = page.locator(".ap-term-text");
  await termText.waitFor();
  const expected = Array.isArray(fragments) ? fragments : [fragments];

  await expect
    .poll(
      async () => {
        const text = await termText.innerText();
        return expected.every((fragment) => text.includes(fragment));
      },
      { timeout },
    )
    .toBe(true);
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

async function sampleTerminalPixels(page, options = {}) {
  const { cells = [], border = false } = options;

  const term = page.locator(".ap-term");
  await term.waitFor();
  const buffer = await term.screenshot({ type: "png" });
  const dataUrl = `data:image/png;base64,${buffer.toString("base64")}`;

  return await term.evaluate(
    async (node, { dataUrl, cells, border }) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      const img = new Image();

      const loaded = new Promise((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Failed to decode screenshot"));
      });

      img.src = dataUrl;
      await loaded;

      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;

      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("2D ctx not available");
      ctx.drawImage(img, 0, 0);

      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const scaleX = img.width / rect.width;
      const scaleY = img.height / rect.height;
      const borderLeft = (Number.parseFloat(style.borderLeftWidth) || 0) * scaleX;
      const borderTop = (Number.parseFloat(style.borderTopWidth) || 0) * scaleY;

      const toHex = (value) => value.toString(16).padStart(2, "0");
      const rgbToHex = (r, g, b) => `#${toHex(r)}${toHex(g)}${toHex(b)}`;

      const samplePixel = (px, py) => {
        const ix = Math.max(0, Math.min(canvas.width - 1, Math.floor(px)));
        const iy = Math.max(0, Math.min(canvas.height - 1, Math.floor(py)));
        const idx = (iy * canvas.width + ix) * 4;
        const r = imgData[idx];
        const g = imgData[idx + 1];
        const b = imgData[idx + 2];
        return rgbToHex(r, g, b);
      };

      let sampledCells = [];

      if (cells.length > 0) {
        const cols = Number.parseInt(style.getPropertyValue("--term-cols"), 10);
        const rows = Number.parseInt(style.getPropertyValue("--term-rows"), 10);
        const borderRight = (Number.parseFloat(style.borderRightWidth) || 0) * scaleX;
        const borderBottom = (Number.parseFloat(style.borderBottomWidth) || 0) * scaleY;
        const contentWidth = img.width - borderLeft - borderRight;
        const contentHeight = img.height - borderTop - borderBottom;
        const cellWidth = contentWidth / cols;
        const cellHeight = contentHeight / rows;

        sampledCells = cells.map((sample) => {
          const [row, col, x, y] = sample;
          const px = borderLeft + (col + x) * cellWidth;
          const py = borderTop + (row + y) * cellHeight;
          return samplePixel(px, py);
        });
      }

      let borderColor = null;

      if (border) {
        const px = Math.max(0, borderLeft / 2);
        const py = img.height / 2;
        borderColor = samplePixel(px, py);
      }

      return { cells: sampledCells, border: borderColor };
    },
    { dataUrl, cells, border },
  );
}

function buildThemeSamples(theme) {
  const samples = [];

  for (let color = 0; color < 16; color += 1) {
    for (let offset = 0; offset < 3; offset += 1) {
      const col = color * 3 + offset;
      samples.push([0, col, 0.8, 0.1, theme.bg]);
      samples.push([0, col, 0.5, 0.5, theme.palette[color]]);
      samples.push([1, col, 0.8, 0.1, theme.palette[color]]);
      samples.push([1, col, 0.5, 0.5, theme.fg]);
    }
  }

  return samples;
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
