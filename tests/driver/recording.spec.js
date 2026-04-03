import { test, expect } from "@playwright/test";
import recording from "../../src/driver/recording.js";

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
      feed: (data) => output.push(data),
      reset: () => {},
      resize: () => {},
      logger: stubLogger(),
      dispatch: () => {},
    },
    { speed: 1 },
  );

  await driver.step(2);

  expect(driver.getCurrentTime()).toBeCloseTo(1.0);
  expect(output.join("")).toContain("start");
  expect(output.join("")).toContain("one");
  expect(output.join("")).not.toContain("two");
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
        feed: () => {},
        reset: () => {},
        resize: () => {},
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

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
