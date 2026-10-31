import { test as base, expect } from "@playwright/test";
import { mock } from "node:test";
import websocket from "../../src/driver/websocket.js";
import eventsource from "../../src/driver/eventsource.js";
import { DummyLogger } from "../../src/logging.js";
import { getTime } from "../../src/timing.js";
import { withFakeTime } from "../helpers/time.js";

const test = base.extend({
  transport: ["websocket", { option: true }],

  stream: async ({ transport }, use) => {
    const events = [];
    const listeners = {};
    let now = 1000;
    mock.method(performance, "now", () => now);

    const connection = {
      protocol: "v2.asciicast",
      closed: false,

      addEventListener: (name, listener) => {
        listeners[name] = listener;
      },

      close() {
        this.closed = true;
      },
    };

    const emit = (name, event = {}) => (connection[`on${name}`] ?? listeners[name])(event);
    const message = (data) => emit("message", { data: JSON.stringify(data) });
    const constructor = transport === "websocket" ? "WebSocket" : "EventSource";
    const original = globalThis[constructor];

    globalThis[constructor] = function () {
      return connection;
    };

    const factory = transport === "websocket" ? websocket : eventsource;
    const driver = factory(
      { url: "/stream", bufferTime: 50, reconnectDelay: () => 60000 },
      { logger: new DummyLogger(), dispatch: (name, payload) => events.push({ name, payload }) },
      {},
    );

    try {
      await use({
        driver,
        connection,
        events,
        emit,
        message,

        advance: (ms) => {
          now += ms;
        },

        timing: () => events.findLast((event) => event.name === "timing")?.payload,

        start() {
          driver.play();
          emit("open");

          message(
            transport === "websocket"
              ? { version: 2, width: 80, height: 24 }
              : { cols: 80, rows: 24, time: 0 },
          );
        },
      });
    } finally {
      driver.stop();

      if (original === undefined) delete globalThis[constructor];
      else globalThis[constructor] = original;

      mock.restoreAll();
    }
  },
});

for (const transport of ["websocket", "eventsource"]) {
  test.describe(transport, () => {
    test.use({ transport });

    test("publishes stream clock corrections in seconds", async ({ stream }) => {
      const { driver, start, message, advance, timing } = stream;
      expect(driver.getTiming()).toMatchObject({ time: null, rate: 0 });
      start();
      expect(timing()).toMatchObject({ time: 0, rate: 1 });

      // Deliver a delayed event so the buffer corrects the running clock backwards.
      advance(2500);
      expect(driver.getTiming()).toMatchObject({ time: 2.5, rate: 1 });
      message([1, "o", "output"]);
      await expect.poll(timing).toMatchObject({ time: 1, rate: 1 });

      advance(500);
      expect(getTime(timing())).toBe(1.5);
      expect(driver.getTiming()).toMatchObject({ time: 1.5, rate: 1 });
    });

    for (const ending of ["disconnect", "end", "stop"]) {
      test(`freezes its clock on ${ending}`, async ({ stream }) => {
        const { driver, start, emit, advance, timing, events, connection } = stream;
        start();
        advance(2500);

        if (ending === "stop") {
          driver.stop();
          expect(connection.closed).toBe(true);
        } else {
          if (transport === "websocket") {
            emit("close", { code: ending === "end" ? 1000 : 1006 });
          } else {
            emit(ending === "end" ? "done" : "error");
          }

          expect(events.at(-1).name).toBe(ending === "end" ? "ended" : "loading");
        }

        expect(timing()).toMatchObject({ time: 2.5, rate: 0 });

        advance(1000);
        expect(getTime(timing())).toBe(2.5);
        expect(driver.getTiming()).toMatchObject({ time: 2.5, rate: 0 });
      });
    }

    if (transport === "eventsource") {
      for (const ending of ["done", "offline", "error"]) {
        test(`drains queued output after ${ending} without restarting the clock`, async ({
          stream,
        }) => {
          await withFakeTime(async ({ advanceBy }) => {
            const { driver, start, message, emit, events, timing } = stream;
            const output = () =>
              events.filter((event) => event.name === "output").flatMap((event) => event.payload);
            start();
            message([0, "o", "first"]);
            await advanceBy(20);
            message([0.02, "o", "last"]);
            expect(output()).toEqual([]);

            if (ending === "offline") message({ state: "offline" });
            else emit(ending);

            expect(timing()).toMatchObject({ time: 0.02, rate: 0 });

            await advanceBy(30);
            expect(output()).toEqual(["first"]);
            expect(timing()).toMatchObject({ time: 0, rate: 0 });

            await advanceBy(20);
            expect(output()).toEqual(["first", "last"]);
            expect(timing()).toMatchObject({ time: 0.02, rate: 0 });

            await advanceBy(1000);
            expect(driver.getTiming()).toMatchObject({ time: 0.02, rate: 0 });
          });
        });
      }

      for (const cancellation of ["stop", "reset"]) {
        test(`cancels queued output on ${cancellation}`, async ({ stream }) => {
          await withFakeTime(async ({ advanceBy }) => {
            const { driver, start, message, events, timing } = stream;
            start();
            message([0, "o", "discarded"]);
            await advanceBy(20);

            if (cancellation === "stop") driver.stop();
            else message({ cols: 80, rows: 24, time: 12 });

            const snapshot = timing();
            await advanceBy(1000);
            expect(events.filter((event) => event.name === "output")).toEqual([]);
            expect(timing()).toEqual(snapshot);
            expect(driver.getTiming()).toMatchObject(
              cancellation === "stop" ? { time: 0.02, rate: 0 } : { time: 13, rate: 1 },
            );
          });
        });
      }

      test("freezes offline and restarts at the next stream's position", async ({ stream }) => {
        const { driver, start, message, advance, timing } = stream;
        start();
        advance(2500);
        message({ state: "offline" });
        expect(timing()).toMatchObject({ time: 2.5, rate: 0 });

        advance(1000);
        expect(driver.getTiming()).toMatchObject({ time: 2.5, rate: 0 });

        message({ cols: 80, rows: 24, time: 12 });
        expect(timing()).toMatchObject({ time: 12, rate: 1 });

        advance(500);
        expect(driver.getTiming()).toMatchObject({ time: 12.5, rate: 1 });
      });
    }
  });
}
