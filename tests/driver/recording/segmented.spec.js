import { test, expect } from "@playwright/test";
import { loadSegmentedRecording } from "../../../src/driver/recording/segmented.js";

test("loadSegmentedRecording validates and normalizes index and segment data", async () => {
  const restoreFetch = stubSegmentedFetch();

  try {
    const loaded = await loadSegmentedRecording({ url: "/recording/index.json" });
    const segment = await loaded.loadSegment(loaded.segments[1]);

    expect(loaded.duration).toBe(60);
    expect(loaded.segments.map(({ start }) => start)).toEqual([0, 30]);
    expect(segment.snapshot).toEqual({ cols: 100, rows: 30, init: "second snapshot" });

    expect(segment.events).toEqual([
      [30, "o", "last"],
      [40, "m", { index: 1, time: 40, label: "summary" }],
      [60, "r", "100x30"],
    ]);
  } finally {
    restoreFetch();
  }
});

test("segmented loading rejects missing snapshots and inconsistent final duration", async () => {
  const index = {
    version: 1,
    duration: 1,
    term: { cols: 80, rows: 24 },
    segments: [{ url: "0.json", start: 0 }],
  };

  let payload = { events: [[1, "o", "end"]] };
  const restoreFetch = stubFetch((url) => Response.json(url === "/index.json" ? index : payload));

  try {
    let loaded = await loadSegmentedRecording({ url: "/index.json" });
    await expect(loaded.loadSegment(loaded.segments[0])).rejects.toThrow(
      "segment 0 snapshot must have positive integer cols and rows",
    );

    payload = {
      snapshot: { cols: 80, rows: 24, init: "" },
      events: [[0.5, "o", "end"]],
    };

    loaded = await loadSegmentedRecording({ url: "/index.json" });
    await expect(loaded.loadSegment(loaded.segments[0])).rejects.toThrow(
      "final segment event must match recording duration",
    );
  } finally {
    restoreFetch();
  }
});

function stubSegmentedFetch() {
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

  return stubFetch((url) => {
    if (url === "/recording/index.json") return Response.json(index);
    return Response.json(segments[url]);
  });
}

function stubFetch(fn) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => await fn(url, opts);

  return () => {
    globalThis.fetch = originalFetch;
  };
}
