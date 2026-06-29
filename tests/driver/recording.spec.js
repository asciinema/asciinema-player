import { test, expect } from "@playwright/test";
import recording from "../../src/driver/recording.js";

// --- init ---

test("init with text poster renders poster without loading recording", async () => {
  const recorder = createDispatchRecorder();
  let parserCalls = 0;

  const driver = recording(
    {
      data: { cols: 80, rows: 24, events: [[100, "o", "start\r\n"]] },
      parser: async (data) => {
        parserCalls++;
        return data;
      },
    },
    {
      logger: stubLogger(),
      dispatch: recorder.dispatch,
    },
    {
      speed: 1,
      preload: false,
      poster: { type: "text", value: "hello world" },
    },
  );

  await driver.init();

  expect(parserCalls).toBe(0);
  expect(recorder.outputs).toEqual(["hello world"]);
  expect(recorder.eventsNamed("metadata")).toHaveLength(0);
  expect(recorder.eventsNamed("reset")).toHaveLength(0);
});

test("init with npt poster loads recording and renders poster frame", async () => {
  const recorder = createDispatchRecorder();
  let parserCalls = 0;

  const driver = recording(
    {
      data: {
        cols: 80,
        rows: 24,
        events: [
          [100, "o", "start\r\n"],
          [1000, "o", "one\r\n"],
        ],
      },
      parser: async (data) => {
        parserCalls++;
        return data;
      },
    },
    {
      logger: stubLogger(),
      dispatch: recorder.dispatch,
    },
    {
      speed: 1,
      preload: false,
      poster: { type: "npt", value: 0.5 },
    },
  );

  await driver.init();

  expect(parserCalls).toBe(1);
  expect(recorder.eventNames()).toEqual(["metadata", "reset", "output"]);
  expect(recorder.outputs).toEqual([["start\r\n"]]);
});

test("step without a target frame preserves the initial poster", async () => {
  const recorder = createDispatchRecorder();

  const driver = recording(
    source([
      [100, "o", "start\r\n"],
      [1000, "o", "one\r\n"],
    ]),
    { logger: stubLogger(), dispatch: recorder.dispatch },
    { speed: 1, poster: { type: "npt", value: 0.5 } },
  );

  await driver.init();
  await driver.step(-1);

  expect(recorder.outputs).toEqual([["start\r\n"]]);
  expect(driver.getCurrentTime()).toBeCloseTo(0.5);
});

test("init with preload and text poster loads immediately and still renders poster", async () => {
  const recorder = createDispatchRecorder();
  let parserCalls = 0;

  const driver = recording(
    {
      data: { cols: 80, rows: 24, events: [[100, "o", "start\r\n"]] },
      parser: async (data) => {
        parserCalls++;
        return data;
      },
    },
    {
      logger: stubLogger(),
      dispatch: recorder.dispatch,
    },
    {
      speed: 1,
      preload: true,
      poster: { type: "text", value: "hello world" },
    },
  );

  await driver.init();

  expect(parserCalls).toBe(1);
  expect(recorder.eventNames()).toEqual(["metadata", "reset", "output"]);
  expect(recorder.outputs).toEqual(["hello world"]);
});

test("preload exposes duration before playback", async () => {
  const driver = recording(
    source([
      [100, "o", "start"],
      [500, "o", "end"],
    ]),
    { logger: stubLogger(), dispatch() {} },
    { speed: 1, preload: true },
  );

  await driver.init();

  expect(driver.getDuration()).toBe(0.5);
});

// --- play ---

test("play after text poster init loads recording and starts playback", async () => {
  const recorder = createDispatchRecorder();
  let parserCalls = 0;

  const driver = recording(
    {
      data: { cols: 80, rows: 24, events: [[10, "o", "start\r\n"]] },
      parser: async (data) => {
        parserCalls++;
        return data;
      },
    },
    {
      logger: stubLogger(),
      dispatch: recorder.dispatch,
    },
    {
      speed: 1,
      preload: false,
      poster: { type: "text", value: "hello world" },
    },
  );

  await driver.init();
  expect(parserCalls).toBe(0);

  const ended = recorder.waitFor("ended");
  await driver.play();
  await ended;

  expect(parserCalls).toBe(1);

  expect(recorder.eventNames()).toEqual([
    "output",
    "output",
    "play",
    "metadata",
    "reset",
    "playing",
    "output",
    "ended",
  ]);

  expect(recorder.outputs[0]).toBe("hello world");
  expect(recorder.outputs[1]).toBe("\x1bc");
  expect(recorder.outputs[2]).toEqual(["start\r\n"]);
});

test("first play applies startAt before playback starts", async () => {
  const recorder = createDispatchRecorder();

  const driver = recording(
    source([
      [100, "o", "zero\r\n"],
      [200, "o", "one\r\n"],
      [400, "o", "two\r\n"],
    ]),
    {
      logger: stubLogger(),
      dispatch: recorder.dispatch,
    },
    {
      speed: 1,
      startAt: 0.25,
    },
  );

  await driver.play();

  expect(recorder.outputs).toEqual([["zero\r\n", "one\r\n"]]);
  expect(driver.getCurrentTime()).toBeGreaterThanOrEqual(0.25);
  expect(driver.getCurrentTime()).toBeLessThan(0.4);
});

test("play after ended restarts from beginning", async () => {
  const recorder = createDispatchRecorder();

  const driver = recording(
    source([
      [10, "o", "start\r\n"],
      [30, "o", "end\r\n"],
    ]),
    {
      logger: stubLogger(),
      dispatch: recorder.dispatch,
    },
    { speed: 1 },
  );

  let ended = recorder.waitFor("ended");
  await driver.play();
  await ended;

  const firstRunOutputCount = recorder.outputs.length;
  expect(recorder.eventsNamed("ended")).toHaveLength(1);

  ended = recorder.waitFor("ended");
  await driver.play();
  await ended;

  expect(recorder.eventsNamed("play")).toHaveLength(2);
  expect(recorder.eventsNamed("playing")).toHaveLength(2);
  expect(recorder.eventsNamed("ended")).toHaveLength(2);

  expect(recorder.outputs.slice(firstRunOutputCount)).toEqual([
    "\x1bc",
    ["start\r\n"],
    ["end\r\n"],
  ]);
});

test("numeric loop plays exactly N times then ends", async () => {
  const recorder = createDispatchRecorder();

  const driver = recording(
    source([
      [10, "o", "start\r\n"],
      [20, "o", "end\r\n"],
    ]),
    {
      logger: stubLogger(),
      dispatch: recorder.dispatch,
    },
    { speed: 1, loop: 2 },
  );

  const ended = recorder.waitFor("ended");
  await driver.play();
  await ended;

  expect(recorder.eventsNamed("ended")).toHaveLength(1);
  expect(recorder.outputs.filter((o) => o === "\x1bc")).toHaveLength(2);
});

test("play batches adjacent output events at runtime", async () => {
  const recorder = createDispatchRecorder();

  const driver = recording(
    source([
      [1, "o", "hel"],
      [6, "o", "lo"],
      [11, "o", "!"],
      [30, "o", "?"],
    ]),
    {
      logger: stubLogger(),
      dispatch: recorder.dispatch,
    },
    { speed: 1 },
  );

  const ended = recorder.waitFor("ended");
  await driver.play();
  await ended;

  expect(recorder.outputs).toEqual([["hel", "lo", "!"], ["?"]]);
});

test("playback dispatches input events", async () => {
  const recorder = createDispatchRecorder();

  const driver = recording(
    source([
      [10, "i", "a"],
      [20, "i", "\r"],
      [30, "o", "done"],
    ]),
    { logger: stubLogger(), dispatch: recorder.dispatch },
    { speed: 1 },
  );

  const ended = recorder.waitFor("ended");
  await driver.play();
  await ended;

  expect(recorder.eventsNamed("input")).toEqual([
    { name: "input", payload: { data: "a" } },
    { name: "input", payload: { data: "\r" } },
  ]);
});

// --- pause & markers ---

test("pauseOnMarkers pauses playback and resumes on play", async () => {
  const recorder = createDispatchRecorder();

  const driver = recording(
    source([
      [10, "o", "start\r\n"],
      [20, "m", "chapter"],
      [40, "o", "end\r\n"],
    ]),
    {
      logger: stubLogger(),
      dispatch: recorder.dispatch,
    },
    { speed: 1, pauseOnMarkers: true },
  );

  const paused = recorder.waitFor("pause");
  await driver.play();
  await paused;

  expect(recorder.eventsNamed("marker")).toEqual([
    { name: "marker", payload: { index: 0, time: 0.02, label: "chapter" } },
  ]);

  expect(recorder.eventsNamed("pause")).toHaveLength(1);
  expect(driver.getCurrentTime()).toBeCloseTo(0.02, 2);
  expect(recorder.outputs).toEqual([["start\r\n"]]);

  const ended = recorder.waitFor("ended");
  await driver.play();
  await ended;

  expect(recorder.outputs).toEqual([["start\r\n"], ["end\r\n"]]);
  expect(recorder.eventsNamed("ended")).toHaveLength(1);
});

// --- mute ---

test("mute and unmute toggle audio and dispatch events", async () => {
  const restoreAudio = installFakeAudio();
  const recorder = createDispatchRecorder();

  try {
    const driver = recording(
      source([[100, "o", "start\r\n"]]),
      {
        logger: stubLogger(),
        dispatch: recorder.dispatch,
      },
      { speed: 1, preload: true, audioUrl: "/assets/fake.mp3" },
    );

    await driver.init();

    expect(driver.mute()).toBe(true);
    expect(driver.unmute()).toBe(true);

    expect(recorder.eventsNamed("muted")).toEqual([
      { name: "muted", payload: true },
      { name: "muted", payload: false },
    ]);
  } finally {
    restoreAudio();
  }
});

test("mute and unmute are no-ops without audio", async () => {
  const recorder = createDispatchRecorder();

  const driver = recording(
    source([[100, "o", "start\r\n"]]),
    {
      logger: stubLogger(),
      dispatch: recorder.dispatch,
    },
    { speed: 1 },
  );

  await driver.init();

  expect(driver.mute()).toBeUndefined();
  expect(driver.unmute()).toBeUndefined();
  expect(recorder.eventsNamed("muted")).toHaveLength(0);
});

test("audio load failure falls back to playback without audio", async () => {
  const restoreAudio = installFakeAudio({ failLoad: true });
  const recorder = createDispatchRecorder();

  try {
    const driver = recording(
      source([[10, "o", "done"]]),
      { logger: stubLogger(), dispatch: recorder.dispatch },
      { speed: 1, preload: true, audioUrl: "/missing.mp3" },
    );

    await driver.init();

    expect(recorder.eventsNamed("metadata")[0].payload.hasAudio).toBe(false);

    const ended = recorder.waitFor("ended");
    await driver.play();
    await ended;

    expect(recorder.eventsNamed("playing")).toHaveLength(1);
    expect(recorder.eventsNamed("error")).toHaveLength(0);
  } finally {
    restoreAudio();
  }
});

// --- seek ---

test("seek to duration emits ended and pins current time", async () => {
  const recorder = createDispatchRecorder();

  const driver = recording(
    source([
      [100, "o", "start\r\n"],
      [200, "o", "end\r\n"],
    ]),
    {
      logger: stubLogger(),
      dispatch: recorder.dispatch,
    },
    { speed: 1 },
  );

  await driver.seek(999);

  expect(driver.getCurrentTime()).toBe(driver.getDuration());
  expect(recorder.eventsNamed("ended")).toHaveLength(1);
  expect(recorder.eventsNamed("seeked")).toHaveLength(1);
});

test("seek to duration with loop emits ended and pins current time", async () => {
  const recorder = createDispatchRecorder();

  const driver = recording(
    source([
      [10, "o", "start\r\n"],
      [200, "o", "end\r\n"],
    ]),
    {
      logger: stubLogger(),
      dispatch: recorder.dispatch,
    },
    { speed: 1, loop: true },
  );

  await driver.seek(999);

  expect(driver.getCurrentTime()).toBe(driver.getDuration());
  expect(recorder.eventsNamed("ended")).toHaveLength(1);
  expect(recorder.eventsNamed("seeked")).toHaveLength(1);
});

test("seek to duration during playback emits ended and pins current time", async () => {
  const recorder = createDispatchRecorder();

  const driver = recording(
    source([
      [10, "o", "start\r\n"],
      [200, "o", "end\r\n"],
    ]),
    {
      logger: stubLogger(),
      dispatch: recorder.dispatch,
    },
    { speed: 1 },
  );

  const playing = recorder.waitFor("playing");
  await driver.play();
  await playing;
  await driver.seek(999);

  expect(driver.getCurrentTime()).toBe(driver.getDuration());
  expect(recorder.eventsNamed("ended")).toHaveLength(1);
  expect(recorder.eventsNamed("seeked")).toHaveLength(1);
});

test("seek from cold state loads recording and seeks", async () => {
  const recorder = createDispatchRecorder();

  const driver = recording(
    source([
      [100, "o", "start\r\n"],
      [1000, "o", "one\r\n"],
      [2000, "o", "two\r\n"],
    ]),
    {
      logger: stubLogger(),
      dispatch: recorder.dispatch,
    },
    { speed: 1 },
  );

  await driver.seek(0.5);

  expect(recorder.eventsNamed("seeked")).toHaveLength(1);
  expect(recorder.outputs).toEqual([["start\r\n"]]);
  expect(driver.getCurrentTime()).toBeCloseTo(0.5);
});

test("invalid seek target throws without failing the driver", async () => {
  const recorder = createDispatchRecorder();

  const driver = recording(
    source([[10, "o", "start\r\n"]]),
    {
      logger: stubLogger(),
      dispatch: recorder.dispatch,
    },
    { speed: 1 },
  );

  expect(() => driver.seek("wat")).toThrow('invalid seek target: "wat"');

  const ended = recorder.waitFor("ended");
  await driver.play();
  await ended;

  expect(recorder.eventsNamed("error")).toHaveLength(0);
  expect(recorder.eventsNamed("ended")).toHaveLength(1);
});

test("invalid marker seek rejects without failing the driver", async () => {
  const recorder = createDispatchRecorder();

  const driver = recording(
    source([
      [100, "o", "start\r\n"],
      [200, "m", "chapter"],
    ]),
    {
      logger: stubLogger(),
      dispatch: recorder.dispatch,
    },
    { speed: 1 },
  );

  await expect(driver.seek({ marker: 1 })).rejects.toThrow("invalid marker index: 1");

  await driver.seek({ marker: 0 });

  expect(recorder.eventsNamed("error")).toHaveLength(0);
  expect(recorder.eventsNamed("seeked")).toHaveLength(1);
  expect(driver.getCurrentTime()).toBeCloseTo(0.2);
});

// --- step ---

test("step advances across multiple output frames", async () => {
  const recorder = createDispatchRecorder();

  const driver = recording(
    source([
      [100, "o", "start\r\n"],
      [1000, "o", "one\r\n"],
      [2000, "o", "two\r\n"],
    ]),
    {
      logger: stubLogger(),
      dispatch: recorder.dispatch,
    },
    { speed: 1 },
  );

  await driver.step(2);

  expect(driver.getCurrentTime()).toBeCloseTo(1.0);
  expect(recorder.outputs.join("")).toContain("start");
  expect(recorder.outputs.join("")).toContain("one");
  expect(recorder.outputs.join("")).not.toContain("two");
});

test("step reverses across multiple output frames", async () => {
  const recorder = createDispatchRecorder();

  const driver = recording(
    source([
      [100, "o", "start\r\n"],
      [1000, "o", "one\r\n"],
      [2000, "o", "two\r\n"],
    ]),
    {
      logger: stubLogger(),
      dispatch: recorder.dispatch,
    },
    { speed: 1 },
  );

  await driver.step(3);
  recorder.outputs.length = 0;

  await driver.step(-2);

  expect(driver.getCurrentTime()).toBeCloseTo(0.1);
  expect(recorder.outputs).toEqual(["\x1bc", ["start\r\n"]]);
});

test("step to the last frame with loop emits ended and pins current time", async () => {
  const recorder = createDispatchRecorder();

  const driver = recording(
    source([
      [10, "o", "start\r\n"],
      [200, "o", "end\r\n"],
    ]),
    {
      logger: stubLogger(),
      dispatch: recorder.dispatch,
    },
    { speed: 1, loop: true },
  );

  await driver.step(2);

  expect(driver.getCurrentTime()).toBe(driver.getDuration());
  expect(recorder.eventsNamed("ended")).toHaveLength(1);
});

test("step from cold state loads recording and steps", async () => {
  const recorder = createDispatchRecorder();

  const driver = recording(
    source([
      [100, "o", "start\r\n"],
      [1000, "o", "one\r\n"],
      [2000, "o", "two\r\n"],
    ]),
    {
      logger: stubLogger(),
      dispatch: recorder.dispatch,
    },
    { speed: 1 },
  );

  await driver.step(2);

  expect(recorder.outputs).toEqual([["start\r\n", "one\r\n"]]);
  expect(driver.getCurrentTime()).toBeCloseTo(1.0);
});

// --- resize ---

test("resize events dispatch numeric terminal dimensions", async () => {
  const recorder = createDispatchRecorder();

  const driver = recording(
    source([[100, "r", "100x30"]]),
    {
      logger: stubLogger(),
      dispatch: recorder.dispatch,
    },
    { speed: 1 },
  );

  await driver.seek(1);

  expect(recorder.events).toContainEqual({
    name: "resize",
    payload: { cols: 100, rows: 30 },
  });
});

test("size overrides pin terminal dimensions over in-stream resizes", async () => {
  const bothRecorder = createDispatchRecorder();

  const bothDriver = recording(
    source([[100, "r", "100x30"]]),
    { logger: stubLogger(), dispatch: bothRecorder.dispatch },
    { speed: 1, cols: 120, rows: 40 },
  );

  await bothDriver.seek(1);

  // Both overrides set: the override wins over the recording's in-stream resize.
  expect(bothRecorder.eventsNamed("resize").at(-1).payload).toEqual({ cols: 120, rows: 40 });

  const colsRecorder = createDispatchRecorder();

  const colsDriver = recording(
    source([[100, "r", "100x30"]]),
    { logger: stubLogger(), dispatch: colsRecorder.dispatch },
    { speed: 1, cols: 120 },
  );

  await colsDriver.seek(1);

  // Only cols overridden: cols stays pinned while rows still follows the recording.
  expect(colsRecorder.eventsNamed("resize").at(-1).payload).toEqual({ cols: 120, rows: 30 });

  const rowsRecorder = createDispatchRecorder();

  const rowsDriver = recording(
    source([[100, "r", "100x30"]]),
    { logger: stubLogger(), dispatch: rowsRecorder.dispatch },
    { speed: 1, rows: 40 },
  );

  await rowsDriver.seek(1);

  // Only rows overridden: rows stays pinned while cols still follows the recording.
  expect(rowsRecorder.eventsNamed("resize").at(-1).payload).toEqual({ cols: 100, rows: 40 });
});

// --- stop ---

test("stop during playback cancels scheduled progression", async () => {
  const recorder = createDispatchRecorder();

  const driver = recording(
    source([
      [10, "m", "start"],
      [200, "m", "later"],
    ]),
    {
      logger: stubLogger(),
      dispatch: recorder.dispatch,
    },
    { speed: 1 },
  );

  const marker = recorder.waitFor("marker");
  await driver.play();
  await marker;
  await driver.stop();

  await wait(250);

  expect(recorder.eventsNamed("marker")).toEqual([
    { name: "marker", payload: { index: 0, time: 0.01, label: "start" } },
  ]);

  expect(recorder.eventsNamed("ended")).toHaveLength(0);
});

test("stop tears down audio resources and pending waiting state", async () => {
  const restoreAudio = installFakeAudio();
  const recorder = createDispatchRecorder();

  try {
    const driver = recording(
      source([[100, "o", "start\r\n"]]),
      {
        logger: stubLogger(),
        dispatch: recorder.dispatch,
      },
      { speed: 1, audioUrl: "/assets/fake.mp3" },
    );

    await driver.play();
    expect(recorder.eventsNamed("playing")).toHaveLength(1);

    fakeAudioState.lastAudio.dispatch("waiting");
    await driver.stop();
    await wait(1100);

    expect(recorder.eventsNamed("loading")).toHaveLength(0);
    expect(fakeAudioState.lastAudio.pauseCalls).toBeGreaterThan(0);
    expect(fakeAudioState.lastAudio.listeners.get("playing") ?? []).toHaveLength(0);
    expect(fakeAudioState.lastAudio.listeners.get("waiting") ?? []).toHaveLength(0);
    expect(fakeAudioState.closedContexts).toBe(1);
    expect(fakeAudioState.lastAudio.src).toBe("");
  } finally {
    restoreAudio();
  }
});

// --- audio buffering ---

test("audio waiting during playback emits loading and resumes on playing", async () => {
  const restoreAudio = installFakeAudio();
  const recorder = createDispatchRecorder();

  try {
    const driver = recording(
      source([
        [10, "m", "start"],
        [200, "m", "later"],
      ]),
      {
        logger: stubLogger(),
        dispatch: recorder.dispatch,
      },
      { speed: 1, audioUrl: "/assets/fake.mp3" },
    );

    const marker = recorder.waitFor("marker");
    await driver.play();
    await marker;

    const loading = recorder.waitFor("loading");
    fakeAudioState.lastAudio.dispatch("waiting");
    await loading;
    const ended = recorder.waitFor("ended");
    fakeAudioState.lastAudio.dispatch("playing");
    await ended;

    expect(recorder.eventsNamed("loading")).toHaveLength(1);
    expect(recorder.eventsNamed("playing")).toHaveLength(2);

    expect(recorder.eventsNamed("marker")).toEqual([
      { name: "marker", payload: { index: 0, time: 0.01, label: "start" } },
      { name: "marker", payload: { index: 1, time: 0.2, label: "later" } },
    ]);
  } finally {
    restoreAudio();
  }
});

test("seek while buffering returns false and does not emit seeked", async () => {
  const restoreAudio = installFakeAudio();
  const recorder = createDispatchRecorder();

  try {
    const driver = recording(
      source([
        [10, "m", "start"],
        [200, "m", "later"],
      ]),
      {
        logger: stubLogger(),
        dispatch: recorder.dispatch,
      },
      { speed: 1, audioUrl: "/assets/fake.mp3" },
    );

    await driver.play();
    await recorder.waitFor("marker");

    const loading = recorder.waitFor("loading");
    fakeAudioState.lastAudio.dispatch("waiting");
    await loading;

    const bufferedTime = driver.getCurrentTime();
    const seekedCount = recorder.eventsNamed("seeked").length;
    const result = await driver.seek(0.15);

    expect(result).toBe(false);
    expect(recorder.eventsNamed("seeked")).toHaveLength(seekedCount);
    expect(driver.getCurrentTime()).toBeCloseTo(bufferedTime, 2);
  } finally {
    restoreAudio();
  }
});

test("pause while buffering prevents automatic resume", async () => {
  const restoreAudio = installFakeAudio();
  const recorder = createDispatchRecorder();

  try {
    const driver = recording(
      source([
        [10, "m", "start"],
        [200, "m", "later"],
      ]),
      {
        logger: stubLogger(),
        dispatch: recorder.dispatch,
      },
      { speed: 1, audioUrl: "/assets/fake.mp3" },
    );

    const marker = recorder.waitFor("marker");
    await driver.play();
    await marker;

    const loading = recorder.waitFor("loading");
    fakeAudioState.lastAudio.dispatch("waiting");
    await loading;

    const pausedTime = driver.getCurrentTime();
    const playingCount = recorder.eventsNamed("playing").length;
    driver.pause();
    fakeAudioState.lastAudio.dispatch("playing");

    expect(recorder.eventsNamed("playing")).toHaveLength(playingCount);

    expect(recorder.eventsNamed("marker")).toEqual([
      { name: "marker", payload: { index: 0, time: 0.01, label: "start" } },
    ]);

    expect(driver.getCurrentTime()).toBeCloseTo(pausedTime, 2);

    const ended = recorder.waitFor("ended");
    await driver.play();
    await ended;

    expect(recorder.eventsNamed("marker")).toEqual([
      { name: "marker", payload: { index: 0, time: 0.01, label: "start" } },
      { name: "marker", payload: { index: 1, time: 0.2, label: "later" } },
    ]);
  } finally {
    restoreAudio();
  }
});

test("play during buffering keeps recovery event and clears waiting timeout", async () => {
  const restoreAudio = installFakeAudio();
  const recorder = createDispatchRecorder();

  try {
    const driver = recording(
      source([
        [10, "m", "start"],
        [200, "m", "later"],
      ]),
      {
        logger: stubLogger(),
        dispatch: recorder.dispatch,
      },
      { speed: 1, audioUrl: "/assets/fake.mp3" },
    );

    const marker = recorder.waitFor("marker");
    await driver.play();
    await marker;
    fakeAudioState.lastAudio.dispatch("waiting");

    driver.pause();
    await driver.play();
    const playing = recorder.waitFor("playing");
    fakeAudioState.lastAudio.dispatch("playing");
    await playing;
    await wait(1100);

    expect(recorder.eventsNamed("play")).toHaveLength(2);
    expect(recorder.eventsNamed("playing")).toHaveLength(2);
    expect(recorder.eventsNamed("loading")).toHaveLength(0);
  } finally {
    restoreAudio();
  }
});

// --- segmented recordings ---

test("segmented init loads only the initial segment and playback prefetches the next", async () => {
  const requests = [];
  const restoreFetch = stubSegmentedFetch(requests);
  const recorder = createDispatchRecorder();

  try {
    const driver = recording(
      { url: "/recording/index.json", format: "segmented" },
      { logger: stubLogger(), dispatch: recorder.dispatch },
      { speed: 1, preload: true },
    );

    await driver.init();

    expect(requests).toEqual(["/recording/index.json", "http://localhost/recording/0.json"]);

    expect(recorder.eventsNamed("metadata")[0].payload).toEqual({
      duration: 0.06,
      markers: [
        [0.02, "chapter"],
        [0.04, "summary"],
      ],
      hasAudio: false,
    });

    expect(recorder.eventsNamed("reset")[0].payload.init).toBe("first snapshot");

    const ended = recorder.waitFor("ended");
    await driver.play();
    await ended;

    expect(requests).toEqual([
      "/recording/index.json",
      "http://localhost/recording/0.json",
      "http://localhost/recording/1.json",
    ]);

    expect(recorder.outputs).toEqual([["first"], ["last"]]);
    expect(recorder.eventsNamed("reset")).toHaveLength(1);
  } finally {
    restoreFetch();
  }
});

test("cold segmented seek loads the target segment directly and restores its snapshot", async () => {
  const requests = [];
  const restoreFetch = stubSegmentedFetch(requests);
  const recorder = createDispatchRecorder();

  try {
    const driver = recording(
      { url: "/recording/index.json", format: "segmented" },
      { logger: stubLogger(), dispatch: recorder.dispatch },
      { speed: 1 },
    );

    await driver.seek(0.04);

    expect(requests).toEqual(["/recording/index.json", "http://localhost/recording/1.json"]);
    expect(recorder.eventsNamed("reset")[0].payload.init).toBe("second snapshot");
    expect(recorder.outputs).toEqual([["last"]]);
    expect(driver.getCurrentTime()).toBeCloseTo(0.04);
  } finally {
    restoreFetch();
  }
});

test("segmented NPT poster loads only its containing segment", async () => {
  const requests = [];
  const restoreFetch = stubSegmentedFetch(requests);
  const recorder = createDispatchRecorder();

  try {
    const driver = recording(
      { url: "/recording/index.json", format: "segmented" },
      { logger: stubLogger(), dispatch: recorder.dispatch },
      { speed: 1, poster: { type: "npt", value: 0.04 } },
    );

    await driver.init();

    expect(requests).toEqual(["/recording/index.json", "http://localhost/recording/1.json"]);
    expect(recorder.eventsNamed("reset")[0].payload.init).toBe("second snapshot");
    expect(recorder.outputs).toEqual([["last"]]);
  } finally {
    restoreFetch();
  }
});

test("segmented marker metadata and playback use global marker indexes", async () => {
  const requests = [];
  const restoreFetch = stubSegmentedFetch(requests);
  const recorder = createDispatchRecorder();

  try {
    const driver = recording(
      { url: "/recording/index.json", format: "segmented" },
      { logger: stubLogger(), dispatch: recorder.dispatch },
      { speed: 1, preload: true },
    );

    await driver.init();
    const ended = recorder.waitFor("ended");
    await driver.play();
    await ended;

    expect(recorder.eventsNamed("marker")).toEqual([
      {
        name: "marker",
        payload: { index: 0, time: 0.02, label: "chapter" },
      },
      {
        name: "marker",
        payload: { index: 1, time: 0.04, label: "summary" },
      },
    ]);
  } finally {
    restoreFetch();
  }
});

test("segmented recordings reject unsupported options", async () => {
  const requests = [];
  const restoreFetch = stubSegmentedFetch(requests);

  try {
    for (const [sourceOption, playerOption] of [
      ["parser", undefined],
      ["encoding", undefined],
      ["inputOffset", undefined],
      [undefined, "idleTimeLimit"],
      [undefined, "markers"],
    ]) {
      const src = { url: "/recording/index.json", format: "segmented" };
      const options = { speed: 1, preload: true };

      if (sourceOption) src[sourceOption] = sourceOption === "parser" ? () => {} : "value";
      if (playerOption) options[playerOption] = playerOption === "markers" ? [1] : 1;

      const driver = recording(src, { logger: stubLogger(), dispatch() {} }, options);
      await expect(driver.init()).rejects.toThrow("segmented recordings do not support option");
    }

    expect(requests).toEqual([]);
  } finally {
    restoreFetch();
  }
});

test("invalid segmented options do not start audio loading", async () => {
  const restoreAudio = installFakeAudio();

  const driver = recording(
    { url: "/recording/index.json", format: "segmented" },
    { logger: stubLogger(), dispatch() {} },
    {
      speed: 1,
      preload: true,
      idleTimeLimit: 1,
      audioUrl: "/audio.mp3",
    },
  );

  try {
    await expect(driver.init()).rejects.toThrow(
      "segmented recordings do not support option: idleTimeLimit",
    );

    expect(fakeAudioState.lastAudio).toBeUndefined();
  } finally {
    restoreAudio();
  }
});

test("pausing during a pending segment transition prevents automatic resume", async () => {
  const requests = [];
  const gate = createGate();
  const restoreFetch = stubSegmentedFetch(requests, { segmentOneGate: gate });
  const recorder = createDispatchRecorder();

  try {
    const driver = recording(
      { url: "/recording/index.json", format: "segmented" },
      { logger: stubLogger(), dispatch: recorder.dispatch },
      { speed: 1, preload: true },
    );

    await driver.init();
    await driver.play();
    await wait(40);

    expect(driver.getCurrentTime()).toBeCloseTo(0.03, 2);
    await driver.pause();
    gate.resolve();
    await wait(0);
    await wait(0);

    expect(recorder.eventsNamed("playing")).toHaveLength(1);
    expect(recorder.eventsNamed("loading")).toHaveLength(0);
    expect(recorder.outputs).toEqual([["first"]]);

    const ended = recorder.waitFor("ended");
    await driver.play();
    await ended;

    expect(recorder.outputs).toEqual([["first"], ["last"]]);
  } finally {
    restoreFetch();
  }
});

test("required segment failures fail seek, step, and playback positioning", async () => {
  for (const operation of ["seek", "step", "play"]) {
    const requests = [];

    const restoreFetch = stubSegmentedFetch(requests, {
      failSegmentZero: operation === "play" ? 1 : 0,
      failSegmentOne: operation === "play" ? 0 : 1,
    });

    const recorder = createDispatchRecorder();

    try {
      const driver = recording(
        { url: "/recording/index.json", format: "segmented" },
        { logger: stubLogger(), dispatch: recorder.dispatch },
        operation === "play"
          ? { speed: 1, poster: { type: "npt", value: 0.04 } }
          : { speed: 1, preload: true },
      );

      await driver.init();

      const result =
        operation === "seek"
          ? driver.seek(0.04)
          : operation === "step"
            ? driver.step(2)
            : driver.play();

      await expect(result).rejects.toThrow("503 Unavailable");
      expect(recorder.eventsNamed("error")).toHaveLength(1);
      expect(() => driver.play()).toThrow("503 Unavailable");
    } finally {
      restoreFetch();
    }
  }
});

test("fatal boundary failure clears the delayed loading notification", async () => {
  const requests = [];
  const gate = createGate();

  const restoreFetch = stubSegmentedFetch(requests, {
    failSegmentOne: 1,
    segmentOneGate: gate,
  });

  const recorder = createDispatchRecorder();

  try {
    const driver = recording(
      { url: "/recording/index.json", format: "segmented" },
      { logger: stubLogger(), dispatch: recorder.dispatch },
      { speed: 1, preload: true },
    );

    await driver.init();
    await driver.play();
    await wait(40);
    gate.resolve();
    await wait(0);
    await wait(1100);

    expect(recorder.eventsNamed("error")).toHaveLength(1);
    expect(recorder.eventsNamed("loading")).toHaveLength(0);
  } finally {
    gate.resolve();
    restoreFetch();
  }
});

test("stale audio recovery does not resume a pending segment wait", async () => {
  const restoreAudio = installFakeAudio();
  const requests = [];
  const gate = createGate();
  const restoreFetch = stubSegmentedFetch(requests, { segmentOneGate: gate });
  const recorder = createDispatchRecorder();

  try {
    const driver = recording(
      { url: "/recording/index.json", format: "segmented" },
      { logger: stubLogger(), dispatch: recorder.dispatch },
      { speed: 1, preload: true, audioUrl: "/assets/fake.mp3" },
    );

    await driver.init();
    await driver.play();
    await wait(40);

    fakeAudioState.lastAudio.dispatch("playing");
    await wait(20);

    expect(driver.getCurrentTime()).toBeCloseTo(0.03, 2);
    expect(recorder.eventsNamed("playing")).toHaveLength(1);

    const ended = recorder.waitFor("ended");
    gate.resolve();
    await ended;

    expect(recorder.eventsNamed("playing")).toHaveLength(2);
  } finally {
    restoreFetch();
    restoreAudio();
  }
});

test("segment wait longer than one second dispatches loading once", async () => {
  const requests = [];
  const gate = createGate();
  const restoreFetch = stubSegmentedFetch(requests, { segmentOneGate: gate });
  const recorder = createDispatchRecorder();

  try {
    const driver = recording(
      { url: "/recording/index.json", format: "segmented" },
      { logger: stubLogger(), dispatch: recorder.dispatch },
      { speed: 1, preload: true },
    );

    await driver.init();
    await driver.play();
    await wait(1100);

    expect(recorder.eventsNamed("loading")).toHaveLength(1);

    const ended = recorder.waitFor("ended");
    gate.resolve();
    await ended;
  } finally {
    gate.resolve();
    restoreFetch();
  }
});

test("ready segment boundaries advance without loading or resetting", async () => {
  const requests = [];
  const restoreFetch = stubLinearSegmentedFetch(requests);
  const recorder = createDispatchRecorder();

  try {
    const driver = recording(
      { url: "/linear/index.json", format: "segmented" },
      { logger: stubLogger(), dispatch: recorder.dispatch },
      { speed: 1, preload: true },
    );

    await driver.init();
    const ended = recorder.waitFor("ended");
    await driver.play();
    await ended;

    expect(recorder.eventsNamed("loading")).toHaveLength(0);
    expect(recorder.eventsNamed("reset")).toHaveLength(1);
    expect(recordingOutputs(recorder)).toEqual(["zero", "one", "two", "three"]);
  } finally {
    restoreFetch();
  }
});

test("segmented rewind reuses the previous segment and refetches an evicted one", async () => {
  const requests = [];
  const restoreFetch = stubLinearSegmentedFetch(requests);
  const recorder = createDispatchRecorder();

  try {
    const driver = recording(
      { url: "/linear/index.json", format: "segmented" },
      { logger: stubLogger(), dispatch: recorder.dispatch },
      { speed: 1, preload: true },
    );

    await driver.init();
    const ended = recorder.waitFor("ended");
    await driver.play();
    await ended;

    await driver.seek(0.035);
    expect(requestCount(requests, "2.json")).toBe(1);

    await driver.seek(0.015);
    expect(requestCount(requests, "0.json")).toBe(2);
  } finally {
    restoreFetch();
  }
});

test("finite segmented loop reloads and later evicts segment zero", async () => {
  const requests = [];
  const restoreFetch = stubLinearSegmentedFetch(requests);
  const recorder = createDispatchRecorder();

  try {
    const driver = recording(
      { url: "/linear/index.json", format: "segmented" },
      { logger: stubLogger(), dispatch: recorder.dispatch },
      { speed: 1, preload: true, loop: 1 },
    );

    await driver.init();
    const ended = recorder.waitFor("ended");
    await driver.play();
    await ended;

    expect(recordingOutputs(recorder).filter((output) => output === "zero")).toHaveLength(2);
    expect(requestCount(requests, "0.json")).toBe(2);

    await driver.seek(0.015);
    expect(requestCount(requests, "0.json")).toBe(3);
  } finally {
    restoreFetch();
  }
});

test("segmented playback preserves server-provided effective boundary times", async () => {
  const requests = [];
  const restoreFetch = stubEffectiveTimeFetch(requests);
  const recorder = createDispatchRecorder();

  try {
    const driver = recording(
      { url: "/effective/index.json", format: "segmented" },
      { logger: stubLogger(), dispatch: recorder.dispatch },
      { speed: 100, preload: true },
    );

    await driver.init();
    expect(driver.getDuration()).toBe(0.51);

    await driver.seek(0.5);
    expect(driver.getCurrentTime()).toBe(0.5);
    expect(requestCount(requests, "1.json")).toBe(1);
  } finally {
    restoreFetch();
  }
});

test("terminal size overrides apply to full and segmented snapshot restoration", async () => {
  const fullRecorder = createDispatchRecorder();

  const fullDriver = recording(
    source([
      [10, "o", "first"],
      [20, "o", "last"],
    ]),
    { logger: stubLogger(), dispatch: fullRecorder.dispatch },
    { speed: 1, preload: true, cols: 120, rows: 40 },
  );

  await fullDriver.init();
  await fullDriver.seek(0.02);
  await fullDriver.seek(0.005);
  expect(fullRecorder.eventsNamed("reset").at(-1).payload.size).toEqual({ cols: 120, rows: 40 });

  const requests = [];
  const restoreFetch = stubSegmentedFetch(requests);
  const segmentedRecorder = createDispatchRecorder();

  try {
    const segmentedDriver = recording(
      { url: "/recording/index.json", format: "segmented" },
      { logger: stubLogger(), dispatch: segmentedRecorder.dispatch },
      { speed: 1, preload: true, cols: 120, rows: 40 },
    );

    await segmentedDriver.init();
    await segmentedDriver.seek(0.04);

    expect(segmentedRecorder.eventsNamed("reset").at(-1).payload.size).toEqual({
      cols: 120,
      rows: 40,
    });
  } finally {
    restoreFetch();
  }
});

test("NPT poster applies resize events before the poster time", async () => {
  const recorder = createDispatchRecorder();

  const driver = recording(
    source([
      [10, "r", "100x30"],
      [20, "o", "poster"],
    ]),
    { logger: stubLogger(), dispatch: recorder.dispatch },
    { speed: 1, poster: { type: "npt", value: 0.015 } },
  );

  await driver.init();

  expect(recorder.eventsNamed("resize")).toEqual([
    { name: "resize", payload: { cols: 100, rows: 30 } },
  ]);
});

test("seeking away from a pending segment transition clears its loading timeout", async () => {
  const requests = [];
  const gate = createGate();
  const restoreFetch = stubSegmentedFetch(requests, { segmentOneGate: gate });
  const recorder = createDispatchRecorder();

  try {
    const driver = recording(
      { url: "/recording/index.json", format: "segmented" },
      { logger: stubLogger(), dispatch: recorder.dispatch },
      { speed: 1, preload: true },
    );

    await driver.init();
    await driver.play();
    await wait(40);
    await driver.pause();
    await driver.seek(0.01);
    await wait(1100);

    expect(recorder.eventsNamed("loading")).toHaveLength(0);

    await driver.stop();
    gate.resolve();
  } finally {
    restoreFetch();
  }
});

test("stop prevents pending playback positioning from restoring or fetching segments", async () => {
  const requests = [];
  const gate = createGate();
  const restoreFetch = stubSegmentedFetch(requests, { segmentZeroGate: gate });
  const recorder = createDispatchRecorder();

  try {
    const driver = recording(
      { url: "/recording/index.json", format: "segmented" },
      { logger: stubLogger(), dispatch: recorder.dispatch },
      { speed: 1, poster: { type: "npt", value: 0.04 } },
    );

    await driver.init();
    const play = driver.play();
    await wait(0);
    await driver.stop();
    const eventCountAfterStop = recorder.events.length;
    const requestCountAfterStop = requests.length;

    gate.resolve();
    await play;
    await wait(0);

    expect(recorder.events).toHaveLength(eventCountAfterStop);
    expect(requests).toHaveLength(requestCountAfterStop);
  } finally {
    restoreFetch();
  }
});

test("stop prevents pending initial segment loading from activating the recording", async () => {
  const requests = [];
  const gate = createGate();
  const restoreFetch = stubSegmentedFetch(requests, { segmentZeroGate: gate });
  const recorder = createDispatchRecorder();

  try {
    const driver = recording(
      { url: "/recording/index.json", format: "segmented" },
      { logger: stubLogger(), dispatch: recorder.dispatch },
      { speed: 1, preload: true },
    );

    const init = driver.init();
    await wait(0);
    await driver.stop();
    const eventCountAfterStop = recorder.events.length;

    gate.resolve();
    await init;

    expect(recorder.events).toHaveLength(eventCountAfterStop);
    expect(recorder.eventsNamed("metadata")).toHaveLength(0);
    expect(recorder.eventsNamed("reset")).toHaveLength(0);
  } finally {
    restoreFetch();
  }
});

test("stop prevents pending step positioning from restoring a segment", async () => {
  const requests = [];
  const gate = createGate();
  const restoreFetch = stubSegmentedFetch(requests, { segmentOneGate: gate });
  const recorder = createDispatchRecorder();

  try {
    const driver = recording(
      { url: "/recording/index.json", format: "segmented" },
      { logger: stubLogger(), dispatch: recorder.dispatch },
      { speed: 1, preload: true },
    );

    await driver.init();
    const step = driver.step(2);
    await wait(0);
    await driver.stop();
    const eventCountAfterStop = recorder.events.length;

    gate.resolve();
    await step;
    await wait(0);

    expect(recorder.events).toHaveLength(eventCountAfterStop);
  } finally {
    restoreFetch();
  }
});

test("loop waits safely when the evicted first segment is still reloading", async () => {
  const gate = createGate();
  const reloadStarted = createGate();
  const recorder = createDispatchRecorder();
  let segmentZeroLoads = 0;

  const index = {
    version: 1,
    duration: 0.05,
    term: { cols: 80, rows: 24 },
    segments: [
      { url: "0.json", start: 0 },
      { url: "1.json", start: 0.02 },
      { url: "2.json", start: 0.03 },
      { url: "3.json", start: 0.04 },
    ],
  };

  const payloads = {
    "0.json": {
      snapshot: { cols: 80, rows: 24, init: "" },
      events: [[0.01, "o", "zero"]],
    },
    "1.json": {
      snapshot: { cols: 80, rows: 24, init: "zero" },
      events: [[0.02, "o", "one"]],
    },
    "2.json": {
      snapshot: { cols: 80, rows: 24, init: "zero one" },
      events: [[0.03, "o", "two"]],
    },
    "3.json": {
      snapshot: { cols: 80, rows: 24, init: "zero one two" },
      events: [
        [0.04, "o", "three"],
        [0.05, "r", "80x24"],
      ],
    },
  };

  const restoreFetch = stubFetch(async (url) => {
    if (url === "/loop/index.json") return Response.json(index);

    const name = url.split("/").at(-1);

    if (name === "0.json" && segmentZeroLoads++ > 0) {
      reloadStarted.resolve();
      await gate.promise;
    }

    return Response.json(payloads[name]);
  });

  try {
    const driver = recording(
      { url: "/loop/index.json", format: "segmented" },
      { logger: stubLogger(), dispatch: recorder.dispatch },
      { speed: 1, preload: true, loop: true },
    );

    await driver.init();
    await driver.play();
    await reloadStarted.promise;
    await waitForCondition(() => driver.getCurrentTime() >= 0.049);

    expect(driver.getCurrentTime()).toBeCloseTo(0.05, 2);
    expect(recorder.eventsNamed("error")).toHaveLength(0);

    gate.resolve();

    await waitForCondition(
      () =>
        recorder.outputs.filter((output) => Array.isArray(output) && output[0] === "zero").length >=
        2,
    );

    await driver.stop();

    expect(
      recorder.outputs.filter((output) => Array.isArray(output) && output[0] === "zero"),
    ).toHaveLength(2);
  } finally {
    gate.resolve();
    restoreFetch();
  }
});

test("failed segmented prefetch is logged and retried when required", async () => {
  const requests = [];
  const warnings = [];
  const restoreFetch = stubSegmentedFetch(requests, { failSegmentOne: 1 });
  const recorder = createDispatchRecorder();

  try {
    const driver = recording(
      { url: "/recording/index.json", format: "segmented" },
      {
        logger: {
          debug() {},
          warn(message) {
            warnings.push(message);
          },
        },
        dispatch: recorder.dispatch,
      },
      { speed: 1, preload: true },
    );

    await driver.init();
    const ended = recorder.waitFor("ended");
    await driver.play();
    await ended;

    expect(requests.filter((url) => url.endsWith("/1.json"))).toHaveLength(2);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("503 Unavailable");
    expect(recorder.eventsNamed("error")).toHaveLength(0);
  } finally {
    restoreFetch();
  }
});

test("stepping crosses segmented boundaries in both directions", async () => {
  const requests = [];
  const restoreFetch = stubSegmentedFetch(requests);
  const recorder = createDispatchRecorder();

  try {
    const driver = recording(
      { url: "/recording/index.json", format: "segmented" },
      { logger: stubLogger(), dispatch: recorder.dispatch },
      { speed: 1, preload: true },
    );

    await driver.init();
    await driver.step(2);

    expect(recorder.eventsNamed("reset").at(-1).payload.init).toBe("second snapshot");
    expect(driver.getCurrentTime()).toBeCloseTo(0.03);

    await driver.step(-1);

    expect(recorder.eventsNamed("reset").at(-1).payload.init).toBe("first snapshot");
    expect(driver.getCurrentTime()).toBeCloseTo(0.01);
    expect(requests.filter((url) => url.endsWith("/0.json"))).toHaveLength(1);
  } finally {
    restoreFetch();
  }
});

// --- helpers ---

const fakeAudioState = {
  closedContexts: 0,
  lastAudio: undefined,
  pendingPlay: null,
};

function installFakeAudio({ manualPlay = false, failLoad = false } = {}) {
  const originalAudio = globalThis.Audio;
  const originalAudioContext = globalThis.AudioContext;
  fakeAudioState.closedContexts = 0;
  fakeAudioState.lastAudio = undefined;
  fakeAudioState.pendingPlay = null;

  class FakeAudio {
    constructor() {
      this.currentTime = 0;
      this.duration = 10;
      this.loop = false;
      this.preload = "metadata";
      this.crossOrigin = "anonymous";
      this.muted = false;
      this.seekable = { length: 1, end: () => this.duration };
      this.listeners = new Map();
      this.pauseCalls = 0;
      this.src = "";
      fakeAudioState.lastAudio = this;
    }

    addEventListener(name, handler) {
      const handlers = this.listeners.get(name) ?? [];
      handlers.push(handler);
      this.listeners.set(name, handlers);
    }

    removeEventListener(name, handler) {
      const handlers = this.listeners.get(name) ?? [];
      this.listeners.set(
        name,
        handlers.filter((h) => h !== handler),
      );
    }

    dispatch(name) {
      for (const handler of this.listeners.get(name) ?? []) {
        handler();
      }
    }

    load() {
      setTimeout(() => {
        if (this.src !== "") {
          this.dispatch(failLoad ? "error" : "canplay");
        }
      }, 0);
    }

    play() {
      if (manualPlay) {
        const gate = createGate();
        fakeAudioState.pendingPlay = gate;

        return gate.promise.then(() => {
          fakeAudioState.pendingPlay = null;
          this.dispatch("playing");
        });
      }

      setTimeout(() => this.dispatch("playing"), 0);
      return Promise.resolve();
    }

    pause() {
      this.pauseCalls++;
    }
  }

  class FakeAudioContext {
    constructor() {
      this.destination = {};
    }

    createMediaElementSource() {
      return { connect() {} };
    }

    getOutputTimestamp() {
      const time = performance.now();

      return { contextTime: time / 1000, performanceTime: time };
    }

    close() {
      fakeAudioState.closedContexts++;
      return Promise.resolve();
    }
  }

  globalThis.Audio = FakeAudio;
  globalThis.AudioContext = FakeAudioContext;

  return () => {
    globalThis.Audio = originalAudio;
    globalThis.AudioContext = originalAudioContext;
  };
}

async function resolveFakeAudioPlay() {
  for (let i = 0; i < 20; i++) {
    if (fakeAudioState.pendingPlay) {
      fakeAudioState.pendingPlay.resolve();
      return;
    }

    await wait(0);
  }

  throw new Error("timed out waiting for fake audio play");
}

function source(events) {
  return {
    data: { cols: 80, rows: 24, events },
    parser: (data) => data,
  };
}

function createDispatchRecorder() {
  const events = [];
  const outputs = [];
  let waiter = null;

  return {
    events,
    outputs,

    dispatch(name, payload) {
      events.push({ name, payload });

      if (name === "output") {
        outputs.push(payload);
      }

      if (waiter?.name === name) {
        waiter.resolve({ name, payload });
        waiter = null;
      }
    },

    eventNames() {
      return events.map((event) => event.name);
    },

    eventsNamed(name) {
      return events.filter((event) => event.name === name);
    },

    waitFor(name) {
      if (waiter) {
        throw new Error(`already waiting for ${waiter.name}`);
      }

      return new Promise((resolve) => {
        waiter = { name, resolve };
      });
    },
  };
}

function stubLogger() {
  return {
    debug() {},
    warn() {},
  };
}

function stubFetch(fn) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => await fn(url, opts);

  return () => {
    globalThis.fetch = originalFetch;
  };
}

function stubSegmentedFetch(
  requests,
  { segmentZeroGate, segmentOneGate, failSegmentZero = 0, failSegmentOne = 0 } = {},
) {
  const index = {
    version: 1,
    duration: 0.06,
    term: { cols: 100, rows: 30 },
    markers: [
      [0.02, "chapter"],
      [0.04, "summary"],
    ],
    segments: [
      { url: "0.json", start: 0 },
      { url: "1.json", start: 0.03 },
    ],
  };

  const segments = {
    "http://localhost/recording/0.json": {
      snapshot: { cols: 100, rows: 30, init: "first snapshot" },
      events: [
        [0.01, "o", "first"],
        [0.02, "m", "chapter"],
      ],
    },
    "http://localhost/recording/1.json": {
      snapshot: { cols: 100, rows: 30, init: "second snapshot" },
      events: [
        [0.03, "o", "last"],
        [0.04, "m", "summary"],
        [0.06, "r", "100x30"],
      ],
    },
  };

  return stubFetch(async (url) => {
    requests.push(url);

    if (url === "/recording/index.json") {
      return Response.json(index);
    }

    if (segments[url]) {
      if (url.endsWith("/0.json")) {
        await segmentZeroGate?.promise;

        if (failSegmentZero > 0) {
          failSegmentZero--;
          return new Response("unavailable", { status: 503, statusText: "Unavailable" });
        }
      }

      if (url.endsWith("/1.json")) {
        await segmentOneGate?.promise;

        if (failSegmentOne > 0) {
          failSegmentOne--;
          return new Response("unavailable", { status: 503, statusText: "Unavailable" });
        }
      }

      return Response.json(segments[url]);
    }

    return new Response("missing", { status: 404, statusText: "Not Found" });
  });
}

function stubLinearSegmentedFetch(requests) {
  const index = {
    version: 1,
    duration: 0.05,
    term: { cols: 80, rows: 24 },
    segments: [
      { url: "0.json", start: 0 },
      { url: "1.json", start: 0.02 },
      { url: "2.json", start: 0.03 },
      { url: "3.json", start: 0.04 },
    ],
  };

  const segments = {
    "0.json": {
      snapshot: { cols: 80, rows: 24, init: "" },
      events: [[0.01, "o", "zero"]],
    },

    "1.json": {
      snapshot: { cols: 80, rows: 24, init: "zero" },
      events: [[0.02, "o", "one"]],
    },

    "2.json": {
      snapshot: { cols: 80, rows: 24, init: "zero one" },
      events: [[0.03, "o", "two"]],
    },

    "3.json": {
      snapshot: { cols: 80, rows: 24, init: "zero one two" },
      events: [
        [0.04, "o", "three"],
        [0.05, "r", "80x24"],
      ],
    },
  };

  return stubFetch((url) => {
    requests.push(url);

    if (url === "/linear/index.json") return Response.json(index);

    return Response.json(segments[url.split("/").at(-1)]);
  });
}

function stubEffectiveTimeFetch(requests) {
  const index = {
    version: 1,
    duration: 0.51,
    term: { cols: 80, rows: 24 },
    segments: [
      { url: "0.json", start: 0 },
      { url: "1.json", start: 0.5 },
    ],
  };

  const segments = {
    "0.json": {
      snapshot: { cols: 80, rows: 24, init: "" },
      events: [[0.01, "o", "before limited gap"]],
    },

    "1.json": {
      snapshot: { cols: 80, rows: 24, init: "before limited gap" },
      events: [
        [0.5, "o", "after limited gap"],
        [0.51, "r", "80x24"],
      ],
    },
  };

  return stubFetch((url) => {
    requests.push(url);

    if (url === "/effective/index.json") return Response.json(index);

    return Response.json(segments[url.split("/").at(-1)]);
  });
}

function requestCount(requests, name) {
  return requests.filter((url) => url.endsWith(`/${name}`)).length;
}

function recordingOutputs(recorder) {
  return recorder.outputs.flatMap((output) => (Array.isArray(output) ? output : []));
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForCondition(condition, timeout = 1000) {
  const deadline = performance.now() + timeout;

  while (!condition()) {
    if (performance.now() >= deadline) {
      throw new Error("timed out waiting for condition");
    }

    await wait(1);
  }
}

function createGate() {
  let resolve;

  const promise = new Promise((resolve_) => {
    resolve = resolve_;
  });

  return { promise, resolve };
}
