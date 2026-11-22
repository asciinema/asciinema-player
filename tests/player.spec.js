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

for (const fit of ["width", "height", "both"]) {
  test(`fit=${fit} measures scoped typography while hidden`, async ({ page }) => {
    await page.goto("/index.html");

    await page.addStyleTag({
      content: `
        #player { display: none; width: 813px; height: 400px; }
        #player .ap-player { font-size: 24px; --term-font-family: monospace; }
      `,
    });

    await page.evaluate(async (fit) => {
      window.player = AsciinemaPlayer.create(
        "/assets/resizing.cast",
        document.getElementById("player"),
        { fit, terminalLineHeight: 1.7 },
      );
      await window.player.play();
      await window.player.pause();
      await window.player.seek(2.05);
      document.getElementById("player").style.display = "block";
    }, fit);

    for (const [width, height, time, cols] of [
      [813, 400, 2.05, 50],
      [fit === "height" ? 1200 : 427, 800, 0, 80],
    ]) {
      await page.evaluate((time) => window.player.seek(time), time);
      await setPlayerContainerSize(page, width, height);

      await expect(page.locator(".ap-term")).toHaveCSS("--term-cols", String(cols));

      await expect
        .poll(() =>
          page.locator(".ap-player").evaluate(
            (player, { fit, width, height }) => {
              const rect = player.getBoundingClientRect();
              const dx = Math.abs(rect.width - width);
              const dy = Math.abs(rect.height - height);

              if (fit === "width") return dx < 1;
              if (fit === "height") return dy < 1;

              return rect.width <= width + 1 && rect.height <= height + 1 && Math.min(dx, dy) < 1;
            },
            { fit, width, height },
          ),
        )
        .toBe(true);

      await expect
        .poll(() =>
          page.locator(".ap-term").evaluate((term) => {
            const frame = term.parentElement.getBoundingClientRect();
            const terminal = term.getBoundingClientRect();

            return Math.max(
              Math.abs(terminal.width - frame.width),
              Math.abs(terminal.height + 32 - frame.height),
            );
          }),
        )
        .toBeLessThan(1.5);
    }
  });
}

test("fullscreen fits a terminal with a custom fixed font size", async ({ page }) => {
  await createPlayer(page, "/assets/simple.cast", {
    fit: "none",
    terminalFontSize: "24px",
    controls: true,
  });

  await expect(page.locator(".ap-term")).toHaveCSS("font-size", "24px");
  await page.locator(".ap-fullscreen-button").click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);

  await expect
    .poll(() =>
      page.locator(".ap-term").evaluate((term) => {
        const frame = term.parentElement.getBoundingClientRect();
        const terminal = term.getBoundingClientRect();

        return Math.max(
          Math.abs(terminal.width - frame.width),
          Math.abs(terminal.height + 32 - frame.height),
        );
      }),
    )
    .toBeLessThan(1.5);

  await page.evaluate(() => document.exitFullscreen());
  await expect(page.locator(".ap-term")).toHaveCSS("font-size", "24px");
});

test("initializes and plays with null option values", async ({ page }) => {
  const playerApi = await createPlayer(page, "/assets/simple.cast", {
    markers: null,
    poster: null,
    speed: null,
  });

  await playerApi.play();
  await playerApi.events.waitFor("playing");
});

test("create throws synchronously on an invalid markers option", async ({ page }) => {
  await page.goto("/index.html");

  const error = await page.evaluate(() => {
    try {
      AsciinemaPlayer.create("/assets/simple.cast", document.getElementById("player"), {
        markers: "0:12",
      });

      return null;
    } catch (e) {
      return e.message;
    }
  });

  expect(error).toMatch(/markers option must be an array/);
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

// Re-entrancy guard: seeking from inside an event listener calls back into the player
// while it is mid-dispatch. Core queues public commands (see Core#_enqueue), so the seek
// runs after the dispatch unwinds instead of re-entering the driver, which would throw.
test("marker listener can synchronously seek without failing the player", async ({ page }) => {
  // markers.cast: output at 0.2, markers at 0.5 ("first") and 1.1 ("second"), ends at 2.0.
  const playerApi = await createPlayer(page, "/assets/markers.cast");

  await page.evaluate(() => {
    window.__seek = null;

    // Seek on the first marker only, jumping over the second one. The listener runs
    // synchronously inside the player's dispatch, which is the whole point of the test.
    window.player.addEventListener("marker", () => {
      window.__seek ??= window.player.seek(1.3);
    });
  });

  await playerApi.play();

  // Marker at 0.5 fires, which arms the seek above.
  await playerApi.events.waitFor("marker");

  // Let the queued seek settle before asserting on it, otherwise it may still be pending.
  await page.evaluate(() => window.__seek);

  // Playback resumes from 1.3 and runs to the end of the recording.
  await playerApi.events.waitFor("ended");

  const events = await page.evaluate(() => window.__events);

  // A re-entrant seek used to fail the driver, which surfaces to the page as an error event.
  expect(events.filter((event) => event.name === "error")).toEqual([]);

  // The seek jumped past the second marker (1.1), so only the first one was emitted.
  // This also proves the seek actually took effect rather than being silently dropped.
  expect(events.filter((event) => event.name === "marker")).toHaveLength(1);

  // Time is pinned at the duration once playback ends.
  await expectCurrentTime(playerApi).toBeCloseTo(2.0);
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

for (const worker of [false, true]) {
  test(`gutter follows playback speed and pauses (${worker ? "worker" : "main thread"})`, async ({
    page,
  }) => {
    const playerApi = await createPlayer(page, "/assets/simple.cast", { speed: 2 }, worker);
    await playerApi.seek(3);
    await playerApi.play();
    await expectGutterPlaying(page, playerApi, 2);

    await playerApi.pause();
    const paused = await playerApi.getCurrentTime();
    const duration = await playerApi.getDuration();
    expect(await gutterProgress(page)).toBeCloseTo(paused / duration, 3);
    const stoppedFrames = await gutterFrames(page);
    expect(new Set(stoppedFrames.map((frame) => frame.progress)).size).toBe(1);

    await playerApi.play();
    await expectGutterPlaying(page, playerApi, 2);
  });

  test(`gutter snaps on paused and playing seeks (${worker ? "worker" : "main thread"})`, async ({
    page,
  }) => {
    const playerApi = await createPlayer(page, "/assets/simple.cast", { speed: 2 }, worker);

    for (const time of [0, 0.12, 1.2, 2.4]) {
      await playerApi.seek(time);
      expect(await gutterProgress(page)).toBeCloseTo(time / 12, 3);
    }

    await playerApi.seek(3);
    expect(await gutterProgress(page)).toBeCloseTo(0.25, 3);
    await expect(page.locator(".ap-time-elapsed")).toHaveText("00:03");
    await expect(page.locator(".ap-time-remaining")).toHaveText("-00:09");

    await playerApi.seek(9);
    expect(await gutterProgress(page)).toBeCloseTo(0.75, 3);
    await playerApi.seek(2);
    expect(await gutterProgress(page)).toBeCloseTo(2 / 12, 3);

    await playerApi.play();
    await playerApi.seek(6);
    await expectGutterPlaying(page, playerApi, 2);
  });

  test(`gutter reaches the end and resets on replay (${worker ? "worker" : "main thread"})`, async ({
    page,
  }) => {
    const playerApi = await createPlayer(page, "/assets/simple.cast", { speed: 2 }, worker);
    await playerApi.seek(11.8);
    await playerApi.play();
    await playerApi.events.waitFor("ended");
    expect(await gutterProgress(page)).toBeCloseTo(1, 3);

    await playerApi.play();
    await expectGutterPlaying(page, playerApi, 2);
  });

  test(`disposing removes the animated player (${worker ? "worker" : "main thread"})`, async ({
    page,
  }) => {
    const playerApi = await createPlayer(page, "/assets/simple.cast", {}, worker);
    await playerApi.play();
    await page.evaluate(() => window.player.dispose());
    await expect(page.locator(".ap-player")).toHaveCount(0);
  });
}

test("hides keystroke overlay by default", async ({ page }) => {
  const playerApi = await createPlayer(page, "/assets/input.cast");

  await playerApi.play();
  await playerApi.events.collect();

  await expect(page.locator(".ap-overlay-keystrokes")).toHaveCount(0);
});

test("shows keystroke overlay when enabled", async ({ page }) => {
  const playerApi = await createPlayer(page, "/assets/input.cast", { keystrokeOverlay: true });

  await playerApi.play();
  await waitForInputEvents(playerApi, 2);

  await expect(page.locator(".ap-overlay-keystrokes kbd")).toHaveText(["a", "Ret"]);
});

test("positions keystroke overlay near lower right", async ({ page }) => {
  const playerApi = await createPlayer(page, "/assets/input.cast", { keystrokeOverlay: true });

  await playerApi.play();
  await playerApi.events.waitFor("input");

  const playerBox = await page.locator(".ap-player").boundingBox();
  const overlayBox = await page.locator(".ap-overlay-keystrokes").boundingBox();

  expect(playerBox).not.toBeNull();
  expect(overlayBox).not.toBeNull();
  expect(overlayBox.width).toBeLessThan(playerBox.width / 2);
  expect(overlayBox.x).toBeGreaterThan(playerBox.x + playerBox.width * 0.6);
  expect(overlayBox.y).toBeGreaterThan(playerBox.y + playerBox.height * 0.5);
});

test("shows last four keystrokes in a right-anchored reel", async ({ page }) => {
  const playerApi = await createPlayer(page, "/assets/keystroke-reel.cast", {
    keystrokeOverlay: true,
  });

  await playerApi.play();
  await waitForInputEvents(playerApi, 6);

  await expect(page.locator(".ap-overlay-keystrokes kbd")).toHaveText(["Ret", "c", "Esc", "d"]);

  const playerBox = await page.locator(".ap-player").boundingBox();
  const latestBox = await page.locator(".ap-overlay-keystrokes kbd").last().boundingBox();

  expect(playerBox).not.toBeNull();
  expect(latestBox).not.toBeNull();
  expect(latestBox.x + latestBox.width).toBeGreaterThan(playerBox.x + playerBox.width - 24);
});

test("groups text keystrokes into one pill", async ({ page }) => {
  const playerApi = await createPlayer(page, "/assets/text-group-input.cast", {
    keystrokeOverlay: true,
  });

  await playerApi.play();
  await waitForInputEvents(playerApi, 13);

  await expect(page.locator(".ap-overlay-keystrokes kbd")).toHaveText(["cdefghijkl"]);
});

test("counts repeated special keystrokes in one pill", async ({ page }) => {
  const playerApi = await createPlayer(page, "/assets/special-group-input.cast", {
    keystrokeOverlay: true,
  });

  await playerApi.play();
  await waitForInputEvents(playerApi, 3);

  await expect(page.locator(".ap-overlay-keystrokes kbd")).toHaveText(["Ret × 3"]);
});

test("keeps keystroke fade timers independent", async ({ page }) => {
  const playerApi = await createPlayer(page, "/assets/repeated-input.cast", {
    keystrokeOverlay: true,
  });

  await playerApi.play();
  await playerApi.events.waitFor("input");

  const pills = page.locator(".ap-keystroke-pill");

  await expect(pills.first()).not.toHaveClass(/fading/);

  await playerApi.events.waitFor("input");

  await expect(pills).toHaveCount(2);
  await expect(pills.first()).not.toHaveClass(/fading/);
  await expect(pills.last()).not.toHaveClass(/fading/);
  await expect(page.locator(".ap-overlay-keystrokes kbd")).toHaveText(["a", "Ret"]);

  await expect(pills).toHaveCount(2);
  await expect(pills.first()).toHaveClass(/fading/, { timeout: 5000 });
  await expect(pills.last()).not.toHaveClass(/fading/);
});

test("autoplay starts playback without user interaction", async ({ page }) => {
  const playerApi = await createPlayer(page, "/assets/simple.cast", { autoPlay: true });
  await playerApi.events.waitFor("playing");
});

test("segmented source loads through Core and fetches segments on demand", async ({ page }) => {
  const requests = [];

  const payloads = {
    "/recording/index.json": {
      version: 1,
      duration: 0.04,
      term: { cols: 80, rows: 24 },
      segments: [
        { url: "0.json", start: 0 },
        { url: "1.json", start: 0.02 },
      ],
    },

    "/recording/0.json": {
      snapshot: { cols: 80, rows: 24, init: "" },
      events: [[0.01, "o", "first"]],
    },

    "/recording/1.json": {
      snapshot: { cols: 80, rows: 24, init: "first" },
      events: [
        [0.02, "o", "last"],
        [0.04, "r", "80x24"],
      ],
    },
  };

  await page.route("**/recording/*.json", async (route) => {
    const path = new URL(route.request().url()).pathname;
    requests.push(path);
    await route.fulfill({ json: payloads[path] });
  });

  const firstSegmentResponse = page.waitForResponse("**/recording/0.json");

  const playerApi = await createPlayer(
    page,
    { url: "/recording/index.json", format: "segmented" },
    { preload: true },
  );

  await expectDuration(playerApi).toBe(0.04);
  await firstSegmentResponse;
  expect(requests).toEqual(["/recording/index.json", "/recording/0.json"]);

  await playerApi.play();
  await playerApi.events.waitFor("ended");

  expect(requests).toEqual(["/recording/index.json", "/recording/0.json", "/recording/1.json"]);
  await expectTermText(page, ["first", "last"]);
});

test("invalid preload data emits error without an unhandled rejection", async ({ page }) => {
  const playerApi = await createPlayer(page, { data: {} }, { preload: true });

  const event = await playerApi.events.waitFor("error");

  expect(event.payload).toEqual({
    name: "Error",
    message: "invalid data",
  });
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
  const playerApi = await createPlayer(page, "/assets/resizing.cast", {
    markers: [1.5],
    pauseOnMarkers: true,
  });

  const terminal = page.locator(".ap-term");
  await terminal.waitFor();

  await expectTermSize(terminal, 80, 24);

  await playerApi.play();
  await playerApi.events.waitFor("pause");
  await expectTermSize(terminal, 100, 30);

  await playerApi.play();
  await playerApi.events.waitFor("ended");
  await expectTermSize(terminal, 50, 10);
});

test("seeking matches playback across resizes and screen switches", async ({ page }) => {
  const checkpoints = [
    { time: 0.15, cols: 8, text: ["head", "ab界cd界", "ef"] },
    { time: 0.25, cols: 12, text: ["head", "ab界cd界ef"] },
    { time: 0.35, cols: 12, text: ["ALT", ""] },
    { time: 0.45, cols: 12, text: ["head", "ab界cd界ef"] },
    { time: 0.55, cols: 12, text: ["done", ""] },
  ];

  const playerApi = await createPlayer(page, "/assets/vt-replay.cast", {
    cursorMode: "hidden",
    theme: "tango",
    markers: checkpoints.map(({ time }) => time),
    pauseOnMarkers: true,
  });

  const terminal = page.locator(".ap-term");
  const lines = page.locator(".ap-term-text .ap-line");
  const frames = [];

  for (const { cols, text } of checkpoints) {
    await playerApi.play();
    await playerApi.events.waitFor("pause");
    await expectTermSize(terminal, cols, text.length);
    await expect(lines).toHaveText(text);
    frames.push(await readTerminalFrame(page));
  }

  expect(frames[3]).toEqual(frames[1]);

  // Backward seeks reset the terminal and replay the complete prefix, including resizes.
  // The final two forward jumps also batch output across resize and buffer boundaries.
  for (const index of [3, 2, 1, 0, 2, 4]) {
    const { time, cols, text } = checkpoints[index];
    await playerApi.seek(time);
    await expectTermSize(terminal, cols, text.length);
    await expect(lines).toHaveText(text);
    expect(await readTerminalFrame(page)).toEqual(frames[index]);
  }
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

test("cursorMode=blinking toggles cursor visibility during playback", async ({ page }) => {
  const playerApi = await createPlayer(page, "/assets/cursor.cast", {
    autoPlay: true,
    theme: "tango",
  });

  await playerApi.events.waitFor("playing");

  const visible = await waitForCellColor(page, [0, 1, 0.5, 0.5], "#cccccc");
  const hidden = await waitForCellColor(page, [0, 1, 0.5, 0.5], "#121314");

  expect(visible).toBe(true);
  expect(hidden).toBe(true);
});

test("terminal activity restores the cursor before the next blink", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });

  const playerApi = await createPlayer(
    page,
    {
      data: [{ version: 2, width: 4, height: 1 }, [0, "o", "A"], [2, "o", "B"], [4, "x", "0"]],
    },
    { preload: true, theme: "tango" },
  );

  await page.clock.pauseAt(new Date("2026-01-01T01:00:00Z"));
  await playerApi.play();
  await playerApi.events.waitFor("playing");

  // The initial activity hold has expired and the cursor blinked off at 1800 ms.
  await page.clock.runFor(1900);
  const hidden = await sampleTerminalPixels(page, { cells: [[0, 1, 0.5, 0.5]] });
  expect(hidden.cells[0]).toBe("#121314");

  // B arrives at 2000 ms. Allow a render, but stay before the blink-on at 2400 ms.
  await page.clock.runFor(150);
  const restored = await sampleTerminalPixels(page, { cells: [[0, 2, 0.5, 0.5]] });
  expect(restored.cells[0]).toBe("#cccccc");
});

test("cursorMode=steady keeps cursor visible during playback", async ({ page }) => {
  const playerApi = await createPlayer(page, "/assets/cursor.cast", {
    autoPlay: true,
    cursorMode: "steady",
    theme: "tango",
  });

  await playerApi.events.waitFor("playing");
  await page.waitForTimeout(800);

  const { cells } = await sampleTerminalPixels(page, { cells: [[0, 1, 0.5, 0.5]] });

  expect(cells[0]).toBe("#cccccc");
});

test("cursorMode=hidden hides cursor", async ({ page }) => {
  const playerApi = await createPlayer(page, "/assets/cursor.cast", {
    autoPlay: true,
    cursorMode: "hidden",
    theme: "tango",
  });

  await playerApi.events.waitFor("playing");

  const { cells } = await sampleTerminalPixels(page, { cells: [[0, 1, 0.5, 0.5]] });

  expect(cells[0]).toBe("#121314");
});

test("cursor changes repaint the affected terminal cells", async ({ page }) => {
  const playerApi = await createPlayer(page, "/assets/vt-cursor.cast", {
    cursorMode: "steady",
    theme: "tango",
  });

  // Dismiss the start overlay before sampling the terminal beneath it.
  await playerApi.play();
  await playerApi.pause();

  const fg = "#cccccc";
  const bg = "#121314";

  const checkpoints = [
    { time: 0.15, text: "", colors: [bg, bg, bg, bg] },
    { time: 0.25, text: "", colors: [bg, fg, bg, bg] },
    { time: 0.35, text: "", colors: [bg, bg, bg, bg] },
    { time: 0.45, text: "界", colors: [bg, bg, bg, fg] },
    { time: 0.55, text: "界", colors: [bg, fg, fg, bg] },
  ];

  for (const { time, text, colors } of checkpoints) {
    await playerApi.seek(time);
    await expect(page.locator(".ap-term-text .ap-line")).toHaveText(["abcd", text]);

    const { cells } = await sampleTerminalPixels(page, {
      cells: [
        [0, 3, 0.9, 0.1],
        [1, 0, 0.9, 0.1],
        [1, 1, 0.9, 0.1],
        [1, 2, 0.9, 0.1],
      ],
    });

    expect(cells).toEqual(colors);
  }
});

for (const column of [1, 2]) {
  for (const { state, cursorMode, visibility, color, inverse = false } of [
    { state: "visible", cursorMode: "steady", visibility: "h", color: "#cccccc" },
    { state: "terminal-hidden", cursorMode: "steady", visibility: "l", color: "#121314" },
    { state: "player-hidden", cursorMode: "hidden", visibility: "h", color: "#121314" },
    { state: "inverse", cursorMode: "steady", visibility: "h", color: "#121314", inverse: true },
  ]) {
    test(`wide-character cursor at column ${column} is ${state}`, async ({ page }) => {
      const playerApi = await createPlayer(
        page,
        {
          data: [
            { version: 2, width: 5, height: 2 },
            [
              0,
              "o",
              `a${inverse ? "\x1b[7m" : ""}全\x1b[0mb\x1b[1;${column + 1}H\x1b[?25${visibility}`,
            ],
            [0.1, "x", "0"],
          ],
        },
        { autoPlay: true, cursorMode, theme: "tango" },
      );

      await playerApi.events.waitFor("ended");

      const { cells } = await sampleTerminalPixels(page, {
        cells: [
          [0, 0, 0.9, 0.1],
          [0, 1, 0.9, 0.1],
          [0, 2, 0.9, 0.1],
          [0, 3, 0.9, 0.1],
        ],
      });

      expect(cells).toEqual(["#121314", color, color, "#121314"]);
    });
  }
}

test("RGB colors apply across text, raster, and SVG layers", async ({ page }) => {
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

test("text layer renders text with foreground and background colors", async ({ page }) => {
  const playerApi = await createPlayer(page, "/assets/text-layer.cast", {
    autoPlay: true,
  });

  await playerApi.events.waitFor("ended");
  await expectTermText(page, "H");

  const fg = "#123456";
  const bg = "#fedcba";

  const { cells } = await sampleTerminalPixels(page, {
    cells: [
      [0, 0, 0.2, 0.5], // H stem: foreground text
      [0, 0, 0.5, 0.35], // H counter: background
      [0, 1, 0.5, 0.5], // styled space: background
    ],
  });

  expect(cells[0]).toBe(fg);
  expect(cells[1]).toBe(bg);
  expect(cells[2]).toBe(bg);
});

test("basic Powerline symbols render as SVG shapes", async ({ page }) => {
  const playerApi = await createPlayer(page, "/assets/powerline-basic-symbols.cast", {
    autoPlay: true,
  });

  await playerApi.events.waitFor("ended");

  const fg = "#123456";
  const bg = "#fedcba";

  const { cells } = await sampleTerminalPixels(page, {
    cells: [
      [0, 0, 0.25, 0.5], // U+E0B0 right triangle: fill
      [0, 0, 0.75, 0.1], // U+E0B0 right triangle: background
      [0, 1, 0.5, 0.25], // U+E0B1 right bracket: stroke
      [0, 1, 0.5, 0.5], // U+E0B1 right bracket: background
      [0, 2, 0.75, 0.5], // U+E0B2 left triangle: fill
      [0, 2, 0.25, 0.1], // U+E0B2 left triangle: background
      [0, 3, 0.5, 0.25], // U+E0B3 left bracket: stroke
      [0, 3, 0.5, 0.5], // U+E0B3 left bracket: background
    ],
  });

  expect(cells[0]).toBe(fg);
  expect(cells[1]).toBe(bg);
  expect(cells[2]).not.toBe(bg);
  expect(cells[3]).toBe(bg);
  expect(cells[4]).toBe(fg);
  expect(cells[5]).toBe(bg);
  expect(cells[6]).not.toBe(bg);
  expect(cells[7]).toBe(bg);
});

test("powerline rounded symbols render as SVG shapes", async ({ page }) => {
  const playerApi = await createPlayer(page, "/assets/powerline-rounded-symbols.cast", {
    autoPlay: true,
  });

  await playerApi.events.waitFor("ended");

  const expectedCodepoints = [0xe0b4, 0xe0b5, 0xe0b6, 0xe0b7];

  const renderedSymbols = await page.locator(".ap-term-symbols").evaluate((node) => {
    return {
      defs: [...node.querySelectorAll("symbol")].map((symbol) => symbol.id),
      uses: [...node.querySelectorAll("use")].map((use) => use.getAttribute("href")),
    };
  });

  for (const codepoint of expectedCodepoints) {
    expect(renderedSymbols.defs).toContain(`sym-${codepoint}`);
    expect(renderedSymbols.uses).toContain(`#sym-${codepoint}`);
  }

  const fg = "#123456";
  const bg = "#fedcba";

  const { cells } = await sampleTerminalPixels(page, {
    cells: [
      [0, 0, 0.75, 0.5], // U+E0B4 right rounded cap: fill
      [0, 0, 0.9, 0.05], // U+E0B4 right rounded cap: background
      [0, 1, 0.99, 0.5], // U+E0B5 right rounded cap: stroke
      [0, 1, 0.5, 0.5], // U+E0B5 right rounded cap: background
      [0, 2, 0.25, 0.5], // U+E0B6 left rounded cap: fill
      [0, 2, 0.1, 0.05], // U+E0B6 left rounded cap: background
      [0, 3, 0.5, 0.5], // U+E0B7 left rounded cap: background
    ],
  });

  expect(cells[0]).toBe(fg);
  expect(cells[1]).toBe(bg);
  expect(cells[2]).not.toBe(bg);
  expect(cells[3]).toBe(bg);
  expect(cells[4]).toBe(fg);
  expect(cells[5]).toBe(bg);
  expect(cells[6]).toBe(bg);
});

test("powerline extra symbols render as SVG shapes", async ({ page }) => {
  const playerApi = await createPlayer(page, "/assets/powerline-extra-symbols.cast", {
    autoPlay: true,
  });

  await playerApi.events.waitFor("ended");

  const expectedCodepoints = [0xe0b8, 0xe0b9, 0xe0ba, 0xe0bb, 0xe0bc, 0xe0bd, 0xe0be, 0xe0bf];

  const renderedSymbols = await page.locator(".ap-term-symbols").evaluate((node) => {
    return {
      defs: [...node.querySelectorAll("symbol")].map((symbol) => symbol.id),
      uses: [...node.querySelectorAll("use")].map((use) => use.getAttribute("href")),
    };
  });

  for (const codepoint of expectedCodepoints) {
    expect(renderedSymbols.defs).toContain(`sym-${codepoint}`);
    expect(renderedSymbols.uses).toContain(`#sym-${codepoint}`);
  }

  const fg = "#123456";
  const bg = "#fedcba";

  const { cells } = await sampleTerminalPixels(page, {
    cells: [
      [0, 0, 0.25, 0.75], // U+E0B8 lower-left triangle: fill
      [0, 0, 0.75, 0.25], // U+E0B8 lower-left triangle: background
      [0, 1, 0.5, 0.5], // U+E0B9 backslash separator: stroke
      [0, 2, 0.75, 0.75], // U+E0BA lower-right triangle: fill
      [0, 2, 0.25, 0.25], // U+E0BA lower-right triangle: background
      [0, 3, 0.5, 0.5], // U+E0BB forwardslash separator: stroke
      [0, 4, 0.25, 0.25], // U+E0BC upper-left triangle: fill
      [0, 4, 0.75, 0.75], // U+E0BC upper-left triangle: background
      [0, 5, 0.5, 0.5], // U+E0BD forwardslash separator: stroke
      [0, 6, 0.75, 0.25], // U+E0BE upper-right triangle: fill
      [0, 6, 0.25, 0.75], // U+E0BE upper-right triangle: background
      [0, 7, 0.5, 0.5], // U+E0BF backslash separator: stroke
    ],
  });

  expect(cells[0]).toBe(fg);
  expect(cells[1]).toBe(bg);
  expect(cells[2]).not.toBe(bg);
  expect(cells[3]).toBe(fg);
  expect(cells[4]).toBe(bg);
  expect(cells[5]).not.toBe(bg);
  expect(cells[6]).toBe(fg);
  expect(cells[7]).toBe(bg);
  expect(cells[8]).not.toBe(bg);
  expect(cells[9]).toBe(fg);
  expect(cells[10]).toBe(bg);
  expect(cells[11]).not.toBe(bg);
});

test("raster symbol groups render representative glyphs with expected pixels", async ({ page }) => {
  const playerApi = await createPlayer(page, "/assets/raster-symbol-groups.cast", {
    autoPlay: true,
    theme: "dracula",
  });

  await playerApi.events.waitFor("ended");

  const fg = "#f8f8f2";
  const bg = "#282a36";
  const topY = 5.5 / 24;
  const bottomY = 18.5 / 24;

  const { cells } = await sampleTerminalPixels(page, {
    cells: [
      [0, 0, 0.5625, 0.5], // U+2503 heavy vertical: right stroke
      [0, 0, 0.4375, 0.5], // U+2503 heavy vertical: left stroke
      [0, 0, 0.3125, 0.5], // U+2503 heavy vertical: side background
      [0, 1, 0.4375, topY], // U+2579 heavy up: left top stroke
      [0, 1, 0.5625, topY], // U+2579 heavy up: right top stroke
      [0, 1, 0.5625, bottomY], // U+2579 heavy up: bottom background
      [0, 2, 0.5625, topY], // U+257B heavy down: top background
      [0, 2, 0.4375, bottomY], // U+257B heavy down: left bottom stroke
      [0, 2, 0.5625, bottomY], // U+257B heavy down: right bottom stroke
      [0, 3, 0.5, topY], // U+2580 upper half block: top fill
      [0, 3, 0.5, bottomY], // U+2580 upper half block: bottom background
      [0, 4, 0.25, 0.25], // U+259A quadrant: upper-left fill
      [0, 4, 0.75, 0.25], // U+259A quadrant: upper-right background
      [0, 4, 0.25, 0.75], // U+259A quadrant: lower-left background
      [0, 4, 0.75, 0.75], // U+259A quadrant: lower-right fill
      [0, 5, 0.5, 2.5 / 24], // U+25A0 black square: top background
      [0, 5, 0.5, 11.5 / 24], // U+25A0 black square: middle fill
      [0, 5, 0.5, 21.5 / 24], // U+25A0 black square: bottom background
      [0, 6, 0.25, 4.5 / 24], // U+1FB00 sextant-1: top-left fill
      [0, 6, 0.75, 4.5 / 24], // U+1FB00 sextant-1: top-right background
      [0, 6, 0.25, 12.5 / 24], // U+1FB00 sextant-1: middle-left background
    ],
  });

  expect(cells).toEqual([
    fg,
    fg,
    bg,
    fg,
    fg,
    bg,
    bg,
    fg,
    fg,
    fg,
    bg,
    fg,
    bg,
    bg,
    fg,
    bg,
    fg,
    bg,
    fg,
    bg,
    bg,
  ]);
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

  const { cells, padding } = await sampleTerminalPixels(page, {
    cells: expectedColors,
    padding: true,
  });

  expect(padding.left).toBe("#bababa");

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

  const { cells, padding } = await sampleTerminalPixels(page, {
    cells: expectedColors,
    padding: true,
  });

  expect(padding.left).toBe("#282a36");

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

test("poster - data:text/plain - clears when playback starts", async ({ page }) => {
  const playerApi = await createPlayer(page, "/assets/long.cast", {
    poster: "data:text/plain,hello world",
  });

  await expectTermText(page, "hello world");

  await playerApi.play();
  await playerApi.events.waitFor("playing");
  await expectTermText(page, "start");

  await expect
    .poll(async () => {
      const text = await page.locator(".ap-term-text").innerText();
      return text.includes("hello world");
    })
    .toBe(false);
});

test("edge colors extend into padding without cursor or partial-glyph bleed", async ({ page }) => {
  // Top: red space, green full block on blue, white half block on blue.
  // Middle: inverse yellow/magenta space, two cyan spaces.
  // Bottom: magenta, blue, yellow spaces.
  const initial =
    "\x1b[41m \x1b[32;44m█\x1b[37m▀" +
    "\x1b[2;1H\x1b[33;45;7m \x1b[0;46m  " +
    "\x1b[3;1H\x1b[45m \x1b[44m \x1b[43m \x1b[0m\x1b[1;1H";

  const playerApi = await createPlayer(
    page,
    {
      data: [
        { version: 2, width: 3, height: 3 },
        [0, "o", initial],
        [1, "o", "\x1b[1;2H"], // Cursor on the full block.
        [2, "o", "\x1b[1;3H"], // Cursor on the half block.
        [3, "o", "\x1b[3;1H"], // Cursor in the bottom-left corner.
        [4, "o", "\x1b[3;3H"], // Cursor in the bottom-right corner.
        [5, "o", "\x1b[?25l"],
        [6, "x", "0"],
      ],
    },
    { cursorMode: "steady", theme: "asciinema" },
  );

  await playerApi.play();
  await playerApi.pause();

  const red = "#dd3c69";
  const green = "#4ebf22";
  const blue = "#26b0d7";
  const yellow = "#ddaf3c";
  const cyan = "#54e1b9";
  const magenta = "#b954e1";
  const white = "#d9d9d9";
  const foreground = "#cccccc";

  const padding = {
    topLeft: red,
    top: green,
    topRight: blue,
    left: yellow,
    right: cyan,
    bottomLeft: magenta,
    bottom: blue,
    bottomRight: yellow,
  };

  // Check the changed cells and unchanged padding in the same displayed frame.
  const cells = [
    [0, 0, 0.5, 0.5], // Red space.
    [0, 1, 0.5, 0.5], // Full block.
    [0, 2, 0.5, 0.25], // Half block: foreground.
    [0, 2, 0.5, 0.75], // Half block: background.
    [2, 0, 0.5, 0.5], // Bottom-left space.
    [2, 2, 0.5, 0.5], // Bottom-right space.
  ];

  for (const { name, time, colors } of [
    {
      name: "cursor on red space",
      time: 0.5,
      colors: [foreground, green, white, blue, magenta, yellow],
    },

    {
      name: "cursor on full block",
      time: 1.5,
      colors: [red, blue, white, blue, magenta, yellow],
    },

    {
      name: "cursor on half block",
      time: 2.5,
      colors: [red, green, blue, white, magenta, yellow],
    },

    {
      name: "cursor in bottom-left corner",
      time: 3.5,
      colors: [red, green, white, blue, foreground, yellow],
    },

    {
      name: "cursor in bottom-right corner",
      time: 4.5,
      colors: [red, green, white, blue, magenta, foreground],
    },

    {
      name: "cursor hidden",
      time: 5.5,
      colors: [red, green, white, blue, magenta, yellow],
    },
  ]) {
    await playerApi.seek(time);
    await expect
      .poll(
        async () => {
          const frame = await sampleTerminalPixels(page, { cells, padding: true });
          return { cells: frame.cells, padding: frame.padding };
        },
        { message: name },
      )
      .toEqual({ cells: colors, padding });
  }
});

test("vertical padding follows edge-row background changes", async ({ page }) => {
  const player = await createPlayer(
    page,
    {
      data: [
        { version: 2, width: 3, height: 3 },
        [0, "o", "\x1b[?25l\x1b[48;2;18;52;86m\x1b[2J"],
        [1, "o", "\x1b[1;2H\x1b[49m "],
        [2, "o", "\x1b[1;2H\x1b[48;2;18;52;86m "],
        [3, "o", "\x1b[3;2H\x1b[49m "],
        [4, "o", "\x1b[3;2H\x1b[48;2;18;52;86m "],
        [5, "x", "0"],
      ],
    },
    { theme: "asciinema" },
  );
  await player.play();
  await player.pause();

  const blue = "#123456";
  const bg = "#121314";

  for (const [time, top, bottom] of [
    [0.5, blue, blue],
    [1.5, bg, blue],
    [2.5, blue, blue],
    [3.5, blue, bg],
    [4.5, blue, blue],
  ]) {
    await player.seek(time);
    await expect
      .poll(async () => (await sampleTerminalPixels(page, { padding: true })).padding, {
        message: `background checkpoint ${time}`,
      })
      .toEqual({
        topLeft: top,
        top,
        topRight: top,
        left: blue,
        right: blue,
        bottomLeft: bottom,
        bottom,
        bottomRight: bottom,
      });
  }
});

for (const { name, sgr } of [
  { name: "RGB", sgr: "48;2;18;19;20" },
  { name: "palette", sgr: "48;5;16" },
]) {
  test(`${name} color matching the theme background prevents vertical extension`, async ({
    page,
  }) => {
    const player = await createPlayer(
      page,
      {
        data: [
          { version: 2, width: 3, height: 1 },
          [0, "o", `\x1b[?25l\x1b[48;2;18;52;86m\x1b[2J\x1b[1;2H\x1b[${sgr}m `],
          [0.1, "x", "0"],
        ],
      },
      { autoPlay: true, theme: "asciinema", adaptivePalette: true },
    );
    await player.events.waitFor("ended");
    const { padding } = await sampleTerminalPixels(page, { padding: true });
    expect(padding).toEqual({
      topLeft: "#121314",
      top: "#121314",
      topRight: "#121314",
      left: "#123456",
      right: "#123456",
      bottomLeft: "#121314",
      bottom: "#121314",
      bottomRight: "#121314",
    });
  });
}

test("full blocks and cursor paint do not determine vertical extension", async ({ page }) => {
  const player = await createPlayer(
    page,
    {
      data: [
        { version: 2, width: 1, height: 1 },
        [0, "o", "\x1b[?25l\x1b[38;2;255;0;0m█"],
        [1, "o", "\x1b[H\x1b[?25h"],
        [2, "o", "\x1b[H\x1b[48;2;0;0;255m█\x1b[H"],
        [3, "x", "0"],
      ],
    },
    { theme: "asciinema", cursorMode: "steady" },
  );
  await player.play();
  await player.pause();

  for (const [time, vertical, cell] of [
    [0.5, "#121314", "#ff0000"],
    [1.5, "#121314", "#121314"],
    [2.5, "#ff0000", "#0000ff"],
  ]) {
    await player.seek(time);
    await expect
      .poll(async () => {
        const { padding, cells } = await sampleTerminalPixels(page, {
          padding: true,
          cells: [[0, 0, 0.5, 0.5]],
        });
        return { padding, cells };
      })
      .toEqual({
        padding: {
          topLeft: vertical,
          top: vertical,
          topRight: vertical,
          left: "#ff0000",
          right: "#ff0000",
          bottomLeft: vertical,
          bottom: vertical,
          bottomRight: vertical,
        },
        cells: [cell],
      });
  }
});

test("cursor movement preserves shade blending and padding", async ({ page }) => {
  const player = await createPlayer(
    page,
    {
      data: [
        { version: 2, width: 3, height: 1 },
        [0, "o", "\x1b[?25l\x1b[38;2;204;204;204;48;2;0;0;0m░▒▓"],
        [1, "o", "\x1b[H\x1b[?25h"],
        [2, "o", "\x1b[1;2H"],
        [3, "o", "\x1b[1;3H"],
        [4, "o", "\x1b[?25l"],
        [5, "x", "0"],
      ],
    },
    { theme: "asciinema", cursorMode: "steady" },
  );
  await player.play();
  await player.pause();

  for (const [time, colors] of [
    [0.5, ["#333333", "#666666", "#999999"]],
    [1.5, ["#999999", "#666666", "#999999"]],
    [2.5, ["#333333", "#666666", "#999999"]],
    [3.5, ["#333333", "#666666", "#333333"]],
    [4.5, ["#333333", "#666666", "#999999"]],
  ]) {
    await player.seek(time);
    await expect
      .poll(
        async () => {
          const { cells, padding } = await sampleTerminalPixels(page, {
            cells: [
              [0, 0, 0.5, 0.5],
              [0, 1, 0.5, 0.5],
              [0, 2, 0.5, 0.5],
            ],
            padding: true,
          });
          return { cells, padding: [...new Set(Object.values(padding))] };
        },
        { message: `shade cursor checkpoint ${time}` },
      )
      .toEqual({ cells: colors, padding: ["#000000"] });
  }
});

test("Powerline veto follows edge rows and disappears when their symbols are erased", async ({
  page,
}) => {
  const player = await createPlayer(
    page,
    {
      data: [
        { version: 2, width: 3, height: 3 },
        // A symbol in the middle row does not affect either vertical edge.
        [0, "o", "\x1b[?25l\x1b[48;2;18;52;86m\x1b[2J\x1b[2;2H\uE0B0"],
        [1, "o", "\x1b[1;2H\uE0B0"],
        [2, "o", "\x1b[3;2H\uE0B0"],
        [3, "o", "\x1b[1;2H "],
        [4, "o", "\x1b[3;2H "],
        [5, "x", "0"],
      ],
    },
    { theme: "asciinema", fit: "none", terminalFontSize: "32px" },
  );
  await player.play();
  await player.pause();

  const blue = "#123456";
  const bg = "#121314";

  for (const [time, top, bottom] of [
    [0.5, blue, blue],
    [1.5, bg, blue],
    [2.5, bg, bg],
    [3.5, blue, bg],
    [4.5, blue, blue],
  ]) {
    await player.seek(time);
    await expect
      .poll(async () => (await sampleTerminalPixels(page, { padding: true })).padding, {
        message: `Powerline checkpoint ${time}`,
      })
      .toEqual({
        topLeft: top,
        top,
        topRight: top,
        left: blue,
        right: blue,
        bottomLeft: bottom,
        bottom,
        bottomRight: bottom,
      });
  }
});

for (const [codepoint, blocksPadding] of [
  [0xe0c8, true],
  [0xe0c9, false],
]) {
  test(`Powerline U+${codepoint.toString(16)} ${blocksPadding ? "blocks" : "allows"} vertical padding`, async ({
    page,
  }) => {
    // These characters lie beyond the player's SVG Powerline set. The padding
    // rule also applies to font-rendered symbols, but not every nearby codepoint.
    const player = await createPlayer(
      page,
      {
        data: [
          { version: 2, width: 3, height: 1 },
          [
            0,
            "o",
            `\x1b[?25l\x1b[48;2;18;52;86m\x1b[2J\x1b[1;2H${String.fromCodePoint(codepoint)}`,
          ],
          [0.1, "x", "0"],
        ],
      },
      { autoPlay: true, theme: "asciinema", fit: "none", terminalFontSize: "32px" },
    );
    await player.events.waitFor("ended");

    const blue = "#123456";
    const vertical = blocksPadding ? "#121314" : blue;
    const { padding } = await sampleTerminalPixels(page, { padding: true });
    expect(padding).toEqual({
      topLeft: vertical,
      top: vertical,
      topRight: vertical,
      left: blue,
      right: blue,
      bottomLeft: vertical,
      bottom: vertical,
      bottomRight: vertical,
    });
  });
}

test("padding repaints after clearing, resizing, and seeking backward", async ({ page }) => {
  const playerApi = await createPlayer(
    page,
    {
      data: [
        { version: 2, width: 3, height: 3 },
        [0, "o", "\x1b[?25l\x1b[41m\x1b[2J"],
        [1, "o", "\x1b[0m\x1b[2J"],
        [2, "r", "4x2"],
        [2, "o", "\x1b[44m\x1b[2J"],
        [3, "x", "0"],
      ],
    },
    { theme: "asciinema" },
  );

  await playerApi.play();
  await playerApi.pause();

  // Initial red screen.
  await playerApi.seek(0.5);
  await expectPaddingColor("#dd3c69");
  const { height: initialHeight } = await page.locator(".ap-term").boundingBox();

  // Clearing restores the default background.
  await playerApi.seek(1.5);
  await expectPaddingColor("#121314");

  // Resizing to fewer rows and filling blue repaints the new padding.
  await playerApi.seek(2.5);
  await expectPaddingColor("#26b0d7");
  const { height: resizedHeight } = await page.locator(".ap-term").boundingBox();
  expect(resizedHeight).toBeLessThan(initialHeight);

  // Rewinding restores both the original color and dimensions.
  await playerApi.seek(0.5);
  await expectPaddingColor("#dd3c69");
  const { height: restoredHeight } = await page.locator(".ap-term").boundingBox();
  expect(restoredHeight).toBeCloseTo(initialHeight, 0);

  async function expectPaddingColor(color) {
    await expect
      .poll(
        async () => {
          const { padding } = await sampleTerminalPixels(page, { padding: true });
          return [...new Set(Object.values(padding))];
        },
        { message: `all padding should be ${color}` },
      )
      .toEqual([color]);
  }
});

test.describe("decorated spaces", () => {
  for (const { name, sgr } of [
    { name: "underline", sgr: 4 },
    { name: "strikethrough", sgr: 9 },
  ]) {
    test(`${name} on spaces preserves color and stops at undecorated spaces`, async ({ page }) => {
      const player = await createPlayer(
        page,
        {
          data: [
            { version: 2, width: 7, height: 1 },
            [
              0,
              "o",
              `\x1b[?25l\x1b[${sgr};38;2;255;0;0m X\x1b[38;2;0;255;0m X\x1b[0m \x1b[${sgr};38;2;255;0;0m X`,
            ],
            [0.1, "x", "0"],
          ],
        },
        { autoPlay: true, theme: "tango", fit: "none", terminalFontSize: "32px" },
      );
      await player.events.waitFor("ended");
      const { strips } = await sampleTerminalPixels(page, {
        strips: [
          [0, 0],
          [0, 2],
          [0, 4],
          [0, 5],
        ],
      });
      expect(strips[0]).toContain("#ff0000");
      expect(strips[1]).toContain("#00ff00");
      expect([...new Set(strips[2])]).toEqual(["#121314"]);
      expect(strips[3]).toContain("#ff0000");
    });
  }

  test("faint decorated spaces dim independently of adjacent text", async ({ page }) => {
    const player = await createPlayer(
      page,
      {
        data: [
          { version: 2, width: 4, height: 1 },
          [0, "o", "\x1b[?25l\x1b[4;38;2;255;255;255m X\x1b[2m X"],
          [0.1, "x", "0"],
        ],
      },
      { autoPlay: true, theme: "tango", fit: "none", terminalFontSize: "32px" },
    );
    await player.events.waitFor("ended");
    const { strips } = await sampleTerminalPixels(page, {
      strips: [
        [0, 0],
        [0, 2],
      ],
    });
    const line = strips[0].indexOf("#ffffff");
    expect(line).toBeGreaterThanOrEqual(0);
    const dimmed = strips[1][line].match(/[0-9a-f]{2}/g).map((channel) => parseInt(channel, 16));
    for (const channel of dimmed) {
      expect(channel).toBeGreaterThanOrEqual(135);
      expect(channel).toBeLessThanOrEqual(139);
    }
  });

  test("blinking decorated spaces disappear independently of adjacent text", async ({ page }) => {
    await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
    const player = await createPlayer(
      page,
      {
        data: [
          { version: 2, width: 4, height: 1 },
          [0, "o", "\x1b[?25l\x1b[4m X\x1b[5m X"],
          [10, "x", "0"],
        ],
      },
      { theme: "tango", preload: true, fit: "none", terminalFontSize: "32px" },
    );
    await page.clock.pauseAt(new Date("2026-01-01T01:00:00Z"));
    await player.play();
    await player.events.waitFor("playing");
    await page.clock.runFor(100);
    let frame = await sampleTerminalPixels(page, {
      strips: [
        [0, 0],
        [0, 2],
      ],
    });
    expect(frame.strips[0]).toContain("#cccccc");
    expect(frame.strips[1]).toContain("#cccccc");
    await page.clock.runFor(600);
    frame = await sampleTerminalPixels(page, {
      strips: [
        [0, 0],
        [0, 2],
      ],
    });
    expect(frame.strips[0]).toContain("#cccccc");
    expect([...new Set(frame.strips[1])]).toEqual(["#121314"]);
  });

  test("cursor inverts the decoration on a space without recoloring its neighbor", async ({
    page,
  }) => {
    const player = await createPlayer(
      page,
      {
        data: [
          { version: 2, width: 2, height: 1 },
          [0, "o", "\x1b[4;38;2;255;0;0m  \x1b[1;2H"],
          [1, "o", "\x1b[?25l"],
          [2, "x", "0"],
        ],
      },
      { cursorMode: "steady", theme: "tango", fit: "none", terminalFontSize: "32px" },
    );
    await player.play();
    await player.pause();
    await player.seek(0.5);
    const on = await sampleTerminalPixels(page, {
      strips: [
        [0, 0],
        [0, 1],
      ],
    });
    const line = on.strips[0].indexOf("#ff0000");
    expect(line).toBeGreaterThanOrEqual(0);
    expect(on.strips[1][line]).toBe("#121314");
    expect(on.strips[1][5]).toBe("#ff0000");
    await player.seek(1.5);
    const off = await sampleTerminalPixels(page, {
      strips: [
        [0, 0],
        [0, 1],
      ],
    });
    expect(off.strips[0]).toEqual(on.strips[0]);
    expect(off.strips[1]).toEqual(off.strips[0]);
  });
});

for (const lineHeight of [1, 1.7]) {
  test(`glyphs stay aligned while scaling with line height ${lineHeight}`, async ({ page }) => {
    const player = await createPlayer(
      page,
      {
        data: [
          { version: 2, width: 20, height: 3 },
          [0, "o", "\x1b[?25l\x1b[38;2;255;255;255;48;2;0;0;0m\x1b[2J\x1b[2;2HH全H─H▀\ue0b0H"],
          [0.1, "x", "0"],
        ],
      },
      {
        autoPlay: true,
        terminalLineHeight: lineHeight,
        terminalFontFamily: "monospace",
        controls: false,
      },
    );
    await player.events.waitFor("ended");

    for (const width of [813, 427]) {
      await setPlayerContainerSize(page, width, 400);
      await expect
        .poll(() =>
          page.locator(".ap-player").evaluate((node) => node.getBoundingClientRect().width),
        )
        .toBe(width);

      await expect
        .poll(async () => {
          const { cells } = await sampleTerminalPixels(page, {
            cells: [
              [1, 1, 0.2, 0.5], // H before the wide character
              [1, 4, 0.2, 0.5], // H after the wide character
              [1, 6, 0.2, 0.5], // H after the standalone line glyph
              [1, 7, 0.5, 0.25],
              [1, 7, 0.5, 0.75], // half block
              [1, 8, 0.25, 0.5],
              [1, 8, 0.75, 0.1], // SVG triangle
              [1, 9, 0.2, 0.5], // H after the SVG
            ],
          });
          return cells;
        })
        .toEqual([
          "#ffffff",
          "#ffffff",
          "#ffffff",
          "#ffffff",
          "#000000",
          "#ffffff",
          "#000000",
          "#ffffff",
        ]);
    }
  });
}

const PLAYER_EVENTS = ["play", "playing", "pause", "ended", "error", "input", "marker"];

async function gutterProgress(page) {
  return page.locator(".ap-gutter-full").evaluate((fill) => {
    const track = fill.parentElement.getBoundingClientRect();
    return Math.max(
      0,
      Math.min(1, (fill.getBoundingClientRect().right - track.left) / track.width),
    );
  });
}

async function gutterFrames(page) {
  return page.locator(".ap-gutter-full").evaluate(async (fill) => {
    const frames = [];

    for (let i = 0; i < 4; i++) {
      const time = await new Promise(requestAnimationFrame);
      const track = fill.parentElement.getBoundingClientRect();

      frames.push({
        time,
        progress: Math.max(
          0,
          Math.min(1, (fill.getBoundingClientRect().right - track.left) / track.width),
        ),
      });
    }

    return frames;
  });
}

async function expectGutterPlaying(page, playerApi, speed) {
  const duration = await playerApi.getDuration();
  const before = await playerApi.getCurrentTime();
  const frames = await gutterFrames(page);
  const after = await playerApi.getCurrentTime();
  const first = frames[0];
  const last = frames.at(-1);

  // Bracket the rendered positions with driver reads, allowing one frame of rendering lag.
  expect(first.progress * duration).toBeGreaterThanOrEqual(before - 0.05);
  expect(last.progress * duration).toBeLessThanOrEqual(after + 0.05);
  expect(frames.every((frame, i) => i === 0 || frame.progress > frames[i - 1].progress)).toBe(true);

  const elapsed = (last.time - first.time) / 1000;
  const played = (last.progress - first.progress) * duration;
  expect(played / elapsed).toBeCloseTo(speed, 1);
}

async function createPlayer(page, src, opts = {}, worker = false) {
  await page.goto("/index.html");

  if (worker) {
    await page.addScriptTag({ path: "dist/bundle/asciinema-player-ui.js" });

    await page.route("**/asciinema-player-worker.js", (route) =>
      route.fulfill({
        path: "dist/bundle/asciinema-player-worker.js",
        contentType: "text/javascript",
      }),
    );
  }

  await page.evaluate(
    ({ src, opts, eventNames, worker }) => {
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

      const element = document.getElementById("player");

      window.player = worker
        ? AsciinemaPlayer.create(src, element, "/asciinema-player-worker.js", opts)
        : AsciinemaPlayer.create(src, element, opts);

      eventNames.forEach((name) => {
        window.player.addEventListener(name, (payload) => {
          window.__pushEvent({ name, payload: payload ?? null });
        });
      });
    },
    { src, opts, eventNames: PLAYER_EVENTS, worker },
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

async function waitForInputEvents(playerApi, count) {
  for (let i = 0; i < count; i += 1) {
    await playerApi.events.waitFor("input");
  }
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
  const { cells = [], padding = false, strips = [] } = options;

  const term = page.locator(".ap-term");
  await term.waitFor();
  const buffer = await term.screenshot({ type: "png" });
  const dataUrl = `data:image/png;base64,${buffer.toString("base64")}`;

  return await term.evaluate(
    async (node, { dataUrl, cells, padding, strips }) => {
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
      const paddingLeft = (Number.parseFloat(style.paddingLeft) || 0) * scaleX;
      const paddingTop = (Number.parseFloat(style.paddingTop) || 0) * scaleY;
      const paddingRight = (Number.parseFloat(style.paddingRight) || 0) * scaleX;
      const paddingBottom = (Number.parseFloat(style.paddingBottom) || 0) * scaleY;
      const cols = Number.parseInt(style.getPropertyValue("--term-cols"), 10);
      const rows = Number.parseInt(style.getPropertyValue("--term-rows"), 10);
      const cellWidth = (img.width - paddingLeft - paddingRight) / cols;
      const cellHeight = (img.height - paddingTop - paddingBottom) / rows;

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
        sampledCells = cells.map((sample) => {
          const [row, col, x, y] = sample;
          const px = paddingLeft + (col + x) * cellWidth;
          const py = paddingTop + (row + y) * cellHeight;
          return samplePixel(px, py);
        });
      }

      const left = paddingLeft / 2;
      const right = img.width - paddingRight / 2;
      const top = paddingTop / 2;
      const bottom = img.height - paddingBottom / 2;
      const paddingPoints = {
        topLeft: [left, top],
        top: [img.width / 2, top],
        topRight: [right, top],
        left: [left, img.height / 2],
        right: [right, img.height / 2],
        bottomLeft: [left, bottom],
        bottom: [img.width / 2, bottom],
        bottomRight: [right, bottom],
      };
      const sampledPadding = padding
        ? Object.fromEntries(
            Object.entries(paddingPoints).map(([name, [x, y]]) => [name, samplePixel(x, y)]),
          )
        : undefined;

      // A vertical screenshot strip finds decoration pixels without assuming a
      // font-specific underline or strikethrough position.
      const sampledStrips = strips.map(([row, col]) =>
        Array.from({ length: Math.floor(cellHeight) }, (_, y) =>
          samplePixel(paddingLeft + (col + 0.5) * cellWidth, paddingTop + row * cellHeight + y),
        ),
      );

      return {
        cells: sampledCells,
        padding: sampledPadding,
        strips: sampledStrips,
      };
    },
    { dataUrl, cells, padding, strips },
  );
}

async function readTerminalFrame(page) {
  return page.locator(".ap-term").evaluate((node) => ({
    text: node.querySelector(".ap-term-text").innerHTML,
    canvas: node.querySelector("canvas").toDataURL(),
    symbols: node.querySelector(".ap-term-symbols > g").innerHTML,
  }));
}

async function waitForCellColor(page, cell, color) {
  for (let i = 0; i < 15; i += 1) {
    const { cells } = await sampleTerminalPixels(page, { cells: [cell] });

    if (cells[0] === color) {
      return true;
    }

    await page.waitForTimeout(200);
  }

  return false;
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
