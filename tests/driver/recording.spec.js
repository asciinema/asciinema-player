import { test, expect } from "@playwright/test";
import recording, { loadRecording, prepareRecording } from "../../src/driver/recording.js";

// --- init ---

test("init with text poster renders poster without loading recording", async () => {
  const recorder = createDispatchRecorder();
  let parserCalls = 0;

  const driver = recording(
    {
      data: { cols: 80, rows: 24, events: [[0.1, "o", "start\r\n"]] },
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
          [0.1, "o", "start\r\n"],
          [1.0, "o", "one\r\n"],
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

test("init with preload and text poster loads immediately and still renders poster", async () => {
  const recorder = createDispatchRecorder();
  let parserCalls = 0;

  const driver = recording(
    {
      data: { cols: 80, rows: 24, events: [[0.1, "o", "start\r\n"]] },
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

test("repeated init returns the cached preload promise", async () => {
  let parserCalls = 0;
  const parserGate = createGate();

  const driver = recording(
    {
      data: { cols: 80, rows: 24, events: [[0.1, "o", "start\r\n"]] },
      parser: async (data) => {
        parserCalls++;
        await parserGate.promise;
        return data;
      },
    },
    {
      logger: stubLogger(),
      dispatch: () => {},
    },
    { speed: 1, preload: true },
  );

  const first = driver.init();
  const second = driver.init();

  expect(second).toBe(first);
  parserGate.resolve();
  await second;
  expect(parserCalls).toBe(1);
});

// --- play ---

test("play after text poster init loads recording and starts playback", async () => {
  const recorder = createDispatchRecorder();
  let parserCalls = 0;

  const driver = recording(
    {
      data: { cols: 80, rows: 24, events: [[0.01, "o", "start\r\n"]] },
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
      [0.1, "o", "zero\r\n"],
      [0.2, "o", "one\r\n"],
      [0.4, "o", "two\r\n"],
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
      [0.01, "o", "start\r\n"],
      [0.03, "o", "end\r\n"],
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
      [0.01, "o", "start\r\n"],
      [0.02, "o", "end\r\n"],
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
      [0.001, "o", "hel"],
      [0.006, "o", "lo"],
      [0.011, "o", "!"],
      [0.03, "o", "?"],
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

// --- pause & markers ---

test("pauseOnMarkers pauses playback and resumes on play", async () => {
  const recorder = createDispatchRecorder();

  const driver = recording(
    source([
      [0.01, "o", "start\r\n"],
      [0.02, "m", "chapter"],
      [0.04, "o", "end\r\n"],
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

test("pause during startup cancels play attempt", async () => {
  const restoreAudio = installFakeAudio({ manualPlay: true });
  const recorder = createDispatchRecorder();

  try {
    const driver = recording(
      source([
        [0.1, "o", "start\r\n"],
        [0.2, "o", "later\r\n"],
      ]),
      {
        logger: stubLogger(),
        dispatch: recorder.dispatch,
      },
      { speed: 1, preload: true, audioUrl: "/assets/fake.mp3" },
    );

    await driver.init();
    const playPromise = driver.play();
    driver.pause();
    await resolveFakeAudioPlay();

    expect(await playPromise).toBe(false);
    expect(recorder.eventsNamed("pause")).toHaveLength(1);
  } finally {
    restoreAudio();
  }
});

// --- mute ---

test("mute and unmute toggle audio and dispatch events", async () => {
  const restoreAudio = installFakeAudio();
  const recorder = createDispatchRecorder();

  try {
    const driver = recording(
      source([[0.1, "o", "start\r\n"]]),
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
    source([[0.1, "o", "start\r\n"]]),
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

// --- seek ---

test("seek to duration emits ended and pins current time", async () => {
  const recorder = createDispatchRecorder();

  const driver = recording(
    source([
      [0.1, "o", "start\r\n"],
      [0.2, "o", "end\r\n"],
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

test("seek to duration with loop restarts playback", async () => {
  const recorder = createDispatchRecorder();

  const driver = recording(
    source([
      [0.01, "o", "start\r\n"],
      [0.2, "o", "end\r\n"],
    ]),
    {
      logger: stubLogger(),
      dispatch: recorder.dispatch,
    },
    { speed: 1, loop: true },
  );

  await driver.seek(999);

  expect(recorder.eventsNamed("ended")).toHaveLength(0);
  expect(recorder.eventsNamed("seeked")).toHaveLength(1);
  expect(recorder.outputs).toContain("\x1bc");
  expect(driver.getCurrentTime()).toBeLessThan(driver.getDuration());
});

test("seek to duration during playback emits ended and pins current time", async () => {
  const recorder = createDispatchRecorder();

  const driver = recording(
    source([
      [0.01, "o", "start\r\n"],
      [0.2, "o", "end\r\n"],
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
      [0.1, "o", "start\r\n"],
      [1.0, "o", "one\r\n"],
      [2.0, "o", "two\r\n"],
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

// --- step ---

test("step advances across multiple output frames", async () => {
  const recorder = createDispatchRecorder();

  const driver = recording(
    source([
      [0.1, "o", "start\r\n"],
      [1.0, "o", "one\r\n"],
      [2.0, "o", "two\r\n"],
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
      [0.1, "o", "start\r\n"],
      [1.0, "o", "one\r\n"],
      [2.0, "o", "two\r\n"],
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

test("step to the last frame with loop restarts playback", async () => {
  const recorder = createDispatchRecorder();

  const driver = recording(
    source([
      [0.01, "o", "start\r\n"],
      [0.2, "o", "end\r\n"],
    ]),
    {
      logger: stubLogger(),
      dispatch: recorder.dispatch,
    },
    { speed: 1, loop: true },
  );

  await driver.step(2);

  expect(recorder.eventsNamed("ended")).toHaveLength(0);
  expect(recorder.outputs).toContain("\x1bc");
  expect(driver.getCurrentTime()).toBeLessThan(driver.getDuration());
});

test("step during startup is a no-op", async () => {
  const restoreAudio = installFakeAudio({ manualPlay: true });
  const recorder = createDispatchRecorder();

  try {
    const driver = recording(
      source([
        [0.2, "o", "start\r\n"],
        [0.4, "o", "later\r\n"],
      ]),
      {
        logger: stubLogger(),
        dispatch: recorder.dispatch,
      },
      { speed: 1, preload: true, audioUrl: "/assets/fake.mp3" },
    );

    await driver.init();
    const playPromise = driver.play();
    driver.step(1);

    expect(recorder.outputs).toEqual([]);

    const ended = recorder.waitFor("ended");
    await resolveFakeAudioPlay();
    await playPromise;
    await ended;

    expect(recorder.outputs).toEqual([["start\r\n"], ["later\r\n"]]);
  } finally {
    restoreAudio();
  }
});

test("step from cold state loads recording and steps", async () => {
  const recorder = createDispatchRecorder();

  const driver = recording(
    source([
      [0.1, "o", "start\r\n"],
      [1.0, "o", "one\r\n"],
      [2.0, "o", "two\r\n"],
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
    source([[0.1, "r", "100x30"]]),
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

// --- stop ---

test("stop during playback cancels scheduled progression", async () => {
  const recorder = createDispatchRecorder();

  const driver = recording(
    source([
      [0.01, "m", "start"],
      [0.2, "m", "later"],
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
      source([[0.1, "o", "start\r\n"]]),
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
        [0.01, "m", "start"],
        [0.2, "m", "later"],
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
        [0.01, "m", "start"],
        [0.2, "m", "later"],
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
        [0.01, "m", "start"],
        [0.2, "m", "later"],
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
        [0.01, "m", "start"],
        [0.2, "m", "later"],
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

// --- loadRecording ---

test("loadRecording fetches a single URL and passes Response to parser", async () => {
  const restoreFetch = stubFetch(() => new Response("hello"));
  let received;
  let receivedEncoding;

  try {
    const recording = await loadRecording({
      url: "/demo.cast",
      encoding: "iso-8859-2",
      parser: async (data, { encoding }) => {
        received = data;
        receivedEncoding = encoding;
        return { cols: 80, rows: 24, events: [[1, "o", "ok"]] };
      },
    });

    expect(recording).toEqual({ cols: 80, rows: 24, events: [[1, "o", "ok"]] });
    expect(received).toBeInstanceOf(Response);
    expect(receivedEncoding).toBe("iso-8859-2");
  } finally {
    restoreFetch();
  }
});

test("loadRecording fetches URL arrays and passes fetchOpts through", async () => {
  const calls = [];

  const restoreFetch = stubFetch((url, opts) => {
    calls.push([url, opts]);
    return new Response(url);
  });

  let received;

  try {
    await loadRecording({
      url: ["/one", "/two"],
      fetchOpts: { method: "POST" },
      parser: async (data) => {
        received = data;
        return { cols: 80, rows: 24, events: [[1, "o", "ok"]] };
      },
    });

    expect(calls).toEqual([
      ["/one", { method: "POST" }],
      ["/two", { method: "POST" }],
    ]);

    expect(Array.isArray(received)).toBe(true);
    expect(received).toHaveLength(2);
    expect(received[0]).toBeInstanceOf(Response);
    expect(received[1]).toBeInstanceOf(Response);
  } finally {
    restoreFetch();
  }
});

test("loadRecording wraps string data in Response and passes objects through unchanged", async () => {
  let firstInput;

  await loadRecording({
    data: '{"version": 2}',
    parser: async (data) => {
      firstInput = data;
      return { cols: 80, rows: 24, events: [[1, "o", "ok"]] };
    },
  });

  expect(firstInput).toBeInstanceOf(Response);

  let secondInput;
  const data = { cols: 80, rows: 24, events: [[1, "o", "ok"]] };

  await loadRecording({
    data,
    parser: async (input) => {
      secondInput = input;
      return data;
    },
  });

  expect(secondInput).toBe(data);
});

test("loadRecording resolves async data functions", async () => {
  let received;

  await loadRecording({
    data: async () => ({ cols: 90, rows: 30, events: [[1, "o", "ok"]] }),
    parser: async (data) => {
      received = data;
      return data;
    },
  });

  expect(received).toEqual({ cols: 90, rows: 30, events: [[1, "o", "ok"]] });
});

test("loadRecording rejects on missing source, fetch failure and parser failure", async () => {
  await expect(
    loadRecording({
      parser: async () => ({ cols: 80, rows: 24, events: [[1, "o", "ok"]] }),
    }),
  ).rejects.toThrow("url/data missing");

  const restoreFetch = stubFetch(
    () => new Response("missing", { status: 404, statusText: "Not Found" }),
  );

  try {
    await expect(
      loadRecording({
        url: "/missing.cast",
        parser: async () => ({ cols: 80, rows: 24, events: [[1, "o", "ok"]] }),
      }),
    ).rejects.toThrow("failed fetching recording from /missing.cast: 404 Not Found");
  } finally {
    restoreFetch();
  }

  await expect(
    loadRecording({
      data: "x",
      parser: async () => {
        throw new Error("parser boom");
      },
    }),
  ).rejects.toThrow("parser boom");
});

// --- prepareRecording ---

test("prepareRecording applies idleTimeLimit from recording or options", () => {
  const base = {
    cols: 80,
    rows: 24,
    idleTimeLimit: 2,
    events: [
      [1, "o", "a"],
      [10, "o", "b"],
    ],
  };

  const withHeaderLimit = prepareRecording(base, {});

  expect(withHeaderLimit.events.map((e) => e[0])).toEqual([1, 3]);
  expect(withHeaderLimit.duration).toBe(3);

  const withOverride = prepareRecording(base, { idleTimeLimit: 4 });

  expect(withOverride.events.map((e) => e[0])).toEqual([1, 5]);
  expect(withOverride.duration).toBe(5);
});

test("prepareRecording wraps embedded markers and can replace them with override markers", () => {
  const base = {
    cols: 80,
    rows: 24,
    events: [
      [1, "o", "a"],
      [2, "m", "embedded"],
      [3, "o", "b"],
    ],
  };

  const embedded = prepareRecording(base, {});

  expect(embedded.events[1]).toEqual([2, "m", { index: 0, time: 2, label: "embedded" }]);

  const overridden = prepareRecording(base, {
    markers: [1.5, [2.5, "override"]],
  });

  expect(overridden.events.filter((e) => e[1] === "m")).toEqual([
    [1.5, "m", { index: 0, time: 1.5, label: "" }],
    [2.5, "m", { index: 1, time: 2.5, label: "override" }],
  ]);
});

test("prepareRecording applies idleTimeLimit to embedded markers", () => {
  const recording = prepareRecording(
    {
      cols: 80,
      rows: 24,
      events: [
        [1, "o", "a"],
        [8, "m", "chapter"],
        [10, "o", "b"],
      ],
    },
    { idleTimeLimit: 2 },
  );

  expect(recording.events).toEqual([
    [1, "o", "a"],
    [3, "m", { index: 0, time: 3, label: "chapter" }],
    [5, "o", "b"],
  ]);

  expect(recording.duration).toBe(5);
});

test("prepareRecording applies idleTimeLimit to override markers", () => {
  const recording = prepareRecording(
    {
      cols: 80,
      rows: 24,
      events: [
        [1, "o", "a"],
        [10, "o", "b"],
        [20, "o", "c"],
      ],
    },
    {
      idleTimeLimit: 2,
      markers: [
        [8, "chapter 1"],
        [15, "chapter 2"],
        [18, "chapter 3"],
      ],
    },
  );

  expect(recording.events).toEqual([
    [1, "o", "a"],
    [3, "m", { index: 0, time: 3, label: "chapter 1" }],
    [5, "o", "b"],
    [7, "m", { index: 1, time: 7, label: "chapter 2" }],
    [9, "m", { index: 2, time: 9, label: "chapter 3" }],
    [11, "o", "c"],
  ]);

  expect(recording.duration).toBe(11);
});

test("prepareRecording computes effectiveStartAt after idle time compression", () => {
  const recording = prepareRecording(
    {
      cols: 80,
      rows: 24,
      events: [
        [1, "o", "a"],
        [10, "o", "b"],
        [12, "o", "c"],
      ],
    },
    { idleTimeLimit: 2, startAt: 11 },
  );

  expect(recording.events.map((e) => e[0])).toEqual([1, 3, 5]);
  expect(recording.effectiveStartAt).toBe(4);
});

test("prepareRecording rejects recordings with no events", () => {
  expect(() =>
    prepareRecording(
      {
        cols: 80,
        rows: 24,
        events: [],
      },
      {},
    ),
  ).toThrow("recording is missing events");
});

// --- helpers ---

const fakeAudioState = {
  closedContexts: 0,
  lastAudio: undefined,
  pendingPlay: null,
};

function installFakeAudio({ manualPlay = false } = {}) {
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
          this.dispatch("canplay");
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

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function createGate() {
  let resolve;

  const promise = new Promise((resolve_) => {
    resolve = resolve_;
  });

  return { promise, resolve };
}
