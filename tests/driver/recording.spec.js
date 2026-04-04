import { test, expect } from "@playwright/test";
import recording, { loadRecording, prepareRecording } from "../../src/driver/recording.js";

test("step advances across multiple output frames", async () => {
  const output = [];

  const driver = recording(
    {
      data: {
        cols: 80,
        rows: 24,
        events: [
          [0.1, "o", "start\r\n"],
          [1.0, "o", "one\r\n"],
          [2.0, "o", "two\r\n"],
        ],
      },
      parser: (data) => data,
    },
    {
      logger: stubLogger(),
      dispatch: (name, payload) => {
        if (name === "output") {
          output.push(payload);
        }
      },
    },
    { speed: 1 },
  );

  await driver.step(2);

  expect(driver.getCurrentTime()).toBeCloseTo(1.0);
  expect(output.join("")).toContain("start");
  expect(output.join("")).toContain("one");
  expect(output.join("")).not.toContain("two");
});

test("resize events dispatch numeric terminal dimensions", async () => {
  const events = [];

  const driver = recording(
    {
      data: {
        cols: 80,
        rows: 24,
        events: [[0.1, "r", "100x30"]],
      },
      parser: (data) => data,
    },
    {
      logger: stubLogger(),
      dispatch: (name, payload) => events.push({ name, payload }),
    },
    { speed: 1 },
  );

  await driver.seek(1);

  expect(events).toContainEqual({
    name: "resize",
    payload: { cols: 100, rows: 30 },
  });
});

test("stop tears down audio resources and pending waiting state", async () => {
  const restoreAudio = installFakeAudio();
  const events = [];

  try {
    const driver = recording(
      {
        data: {
          cols: 80,
          rows: 24,
          events: [[0.1, "o", "start\r\n"]],
        },
        parser: async (data) => data,
      },
      {
        logger: stubLogger(),
        dispatch: (name, payload) => events.push({ name, payload }),
      },
      { speed: 1, audioUrl: "/assets/fake.mp3" },
    );

    await driver.play();
    expect(events.filter((event) => event.name === "playing")).toHaveLength(1);

    fakeAudioState.lastAudio.dispatch("waiting");
    await driver.stop();
    await wait(1100);

    expect(events.filter((event) => event.name === "loading")).toHaveLength(0);
    expect(fakeAudioState.lastAudio.pauseCalls).toBeGreaterThan(0);
    expect(fakeAudioState.lastAudio.listeners.get("playing") ?? []).toHaveLength(0);
    expect(fakeAudioState.lastAudio.listeners.get("waiting") ?? []).toHaveLength(0);
    expect(fakeAudioState.closedContexts).toBe(1);
    expect(fakeAudioState.lastAudio.src).toBe("");
  } finally {
    restoreAudio();
  }
});

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

test("prepareRecording batches adjacent output events", () => {
  const recording = prepareRecording(
    {
      cols: 80,
      rows: 24,
      events: [
        [0.1, "o", "hel"],
        [0.1005, "o", "lo"],
        [0.2, "i", "a"],
        [0.2005, "o", "!"],
      ],
    },
    stubLogger(),
    {},
  );

  expect(recording.events).toEqual([
    [0.1, "o", "hello"],
    [0.2, "i", "a"],
    [0.2005, "o", "!"],
  ]);

  expect(recording.duration).toBeCloseTo(0.2005);
});

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

  const withHeaderLimit = prepareRecording(base, stubLogger(), {});

  expect(withHeaderLimit.events.map((e) => e[0])).toEqual([1, 3]);
  expect(withHeaderLimit.duration).toBe(3);

  const withOverride = prepareRecording(base, stubLogger(), { idleTimeLimit: 4 });

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

  const embedded = prepareRecording(base, stubLogger(), {});

  expect(embedded.events[1]).toEqual([2, "m", { index: 0, time: 2, label: "embedded" }]);

  const overridden = prepareRecording(base, stubLogger(), {
    markers: [1.5, [2.5, "override"]],
  });

  expect(overridden.events.filter((e) => e[1] === "m")).toEqual([
    [1.5, "m", { index: 0, time: 1.5, label: "" }],
    [2.5, "m", { index: 1, time: 2.5, label: "override" }],
  ]);
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
    stubLogger(),
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
      stubLogger(),
      {},
    ),
  ).toThrow("recording is missing events");
});

const fakeAudioState = {
  closedContexts: 0,
  lastAudio: undefined,
};

function installFakeAudio() {
  const originalAudio = globalThis.Audio;
  const originalAudioContext = globalThis.AudioContext;
  fakeAudioState.closedContexts = 0;
  fakeAudioState.lastAudio = undefined;

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
