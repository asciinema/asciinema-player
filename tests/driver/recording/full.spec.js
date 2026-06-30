import { test, expect } from "@playwright/test";
import { loadRecording, prepareRecording } from "../../../src/driver/recording/full.js";

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
    expect(received).toEqual([expect.any(Response), expect.any(Response)]);
  } finally {
    restoreFetch();
  }
});

test("loadRecording wraps string data in Response and passes objects through unchanged", async () => {
  let received;

  await loadRecording({
    data: '{"version": 2}',
    parser: async (data) => {
      received = data;
      return { cols: 80, rows: 24, events: [[1, "o", "ok"]] };
    },
  });

  expect(received).toBeInstanceOf(Response);

  const data = { cols: 80, rows: 24, events: [[1, "o", "ok"]] };

  await loadRecording({
    data,
    parser: async (input) => {
      received = input;
      return data;
    },
  });

  expect(received).toBe(data);
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

test("loadRecording rejects missing sources and fetch or parser failures", async () => {
  await expect(loadRecording({ parser: async () => ({}) })).rejects.toThrow("url/data missing");

  const restoreFetch = stubFetch(
    () => new Response("missing", { status: 404, statusText: "Not Found" }),
  );

  try {
    await expect(loadRecording({ url: "/missing.cast", parser: async () => ({}) })).rejects.toThrow(
      "failed fetching recording from /missing.cast: 404 Not Found",
    );
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

test("prepareRecording applies idleTimeLimit from recording or options", () => {
  const base = {
    cols: 80,
    rows: 24,
    idleTimeLimit: 2,
    events: [
      [1000, "o", "a"],
      [10000, "o", "b"],
    ],
  };

  const withHeaderLimit = prepareRecording(base, {});
  expect(withHeaderLimit.events.map((event) => event[0])).toEqual([1000, 3000]);
  expect(withHeaderLimit.duration).toBe(3000);

  const withOverride = prepareRecording(base, { idleTimeLimit: 4 });
  expect(withOverride.events.map((event) => event[0])).toEqual([1000, 5000]);
  expect(withOverride.duration).toBe(5000);
});

test("prepareRecording wraps embedded markers and can replace them", () => {
  const base = {
    cols: 80,
    rows: 24,
    events: [
      [1000, "o", "a"],
      [2000, "m", "embedded"],
      [3000, "o", "b"],
    ],
  };

  expect(prepareRecording(base, {}).events[1]).toEqual([
    2000,
    "m",
    { index: 0, time: 2000, label: "embedded" },
  ]);

  const overridden = prepareRecording(base, { markers: [1.5, [2.5, "override"]] });

  expect(overridden.events.filter((event) => event[1] === "m")).toEqual([
    [1500, "m", { index: 0, time: 1500, label: "" }],
    [2500, "m", { index: 1, time: 2500, label: "override" }],
  ]);
});

test("prepareRecording applies idleTimeLimit to embedded markers", () => {
  const embedded = prepareRecording(
    {
      cols: 80,
      rows: 24,
      events: [
        [1000, "o", "a"],
        [8000, "m", "chapter"],
        [10000, "o", "b"],
      ],
    },
    { idleTimeLimit: 2 },
  );

  expect(embedded.events).toEqual([
    [1000, "o", "a"],
    [3000, "m", { index: 0, time: 3000, label: "chapter" }],
    [5000, "o", "b"],
  ]);
});

test("prepareRecording places option markers verbatim, after idle time compression", () => {
  const overridden = prepareRecording(
    {
      cols: 80,
      rows: 24,
      events: [
        [1000, "o", "a"],
        [10000, "o", "b"],
        [20000, "o", "c"],
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

  expect(overridden.events).toEqual([
    [1000, "o", "a"],
    [3000, "o", "b"],
    [5000, "o", "c"],
    [8000, "m", { index: 0, time: 8000, label: "chapter 1" }],
    [15000, "m", { index: 1, time: 15000, label: "chapter 2" }],
    [18000, "m", { index: 2, time: 18000, label: "chapter 3" }],
  ]);
});

test("prepareRecording computes effectiveStartAt after idle time compression", () => {
  const recording = prepareRecording(
    {
      cols: 80,
      rows: 24,
      events: [
        [1000, "o", "a"],
        [10000, "o", "b"],
        [12000, "o", "c"],
      ],
    },
    { idleTimeLimit: 2, startAt: 11 },
  );

  expect(recording.events.map((event) => event[0])).toEqual([1000, 3000, 5000]);
  expect(recording.effectiveStartAt).toBe(4000);
});

test("prepareRecording rejects recordings with no events", () => {
  expect(() => prepareRecording({ cols: 80, rows: 24, events: [] }, {})).toThrow(
    "recording is missing events",
  );
});

function stubFetch(fn) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => await fn(url, opts);

  return () => {
    globalThis.fetch = originalFetch;
  };
}
