import { parseNpt } from "./util";
import { Clock, NullClock } from "./clock";
import recording from "./driver/recording";
import clock from "./driver/clock";
import random from "./driver/random";
import benchmark from "./driver/benchmark";
import websocket from "./driver/websocket";
import eventsource from "./driver/eventsource";
import parseAsciicast from "./parser/asciicast";
import parseTypescript from "./parser/typescript";
import parseTtyrec from "./parser/ttyrec";

class Core {
  constructor(src, opts) {
    this.logger = opts.logger;
    this.driverFactory = getDriver(src);
    this.driver = null;
    this.cols = opts.cols;
    this.rows = opts.rows;
    this.speed = opts.speed;
    this.loop = opts.loop;
    this.autoPlay = opts.autoPlay;
    this.idleTimeLimit = opts.idleTimeLimit;
    this.preload = opts.preload;
    this.startAt = parseNpt(opts.startAt);
    this.poster = this._parsePoster(opts.poster);
    this.markers = opts.markers;
    this.pauseOnMarkers = opts.pauseOnMarkers;
    this.audioUrl = opts.audioUrl;
    this.initPromise = null;
    this.commandQueue = Promise.resolve();

    this.startupPromise = new Promise((resolve) => {
      this.resolveStartup = resolve;
    });

    this.eventHandlers = new Map([
      ["ended", []],
      ["error", []],
      ["input", []],
      ["loading", []],
      ["marker", []],
      ["metadata", []],
      ["muted", []],
      ["offline", []],
      ["output", []],
      ["pause", []],
      ["play", []],
      ["playing", []],
      ["reset", []],
      ["resize", []],
      ["ready", []],
      ["seeked", []],
    ]);
  }

  init() {
    if (this.initPromise === null) {
      this.initPromise = this._init();
    }

    return this.initPromise;
  }

  terminalReady() {
    this.resolveStartup();
  }

  async _init() {
    // Wait until Terminal has installed VT event listeners before drivers start dispatching.
    await this.startupPromise;

    this.driver = this.driverFactory(
      {
        dispatch: this._dispatchEvent.bind(this),
        logger: this.logger,
      },
      {
        cols: this.cols,
        rows: this.rows,
        speed: this.speed,
        idleTimeLimit: this.idleTimeLimit,
        startAt: this.startAt,
        preload: this.preload,
        loop: this.loop,
        poster: this.autoPlay ? undefined : this.poster,
        markers: this.markers,
        pauseOnMarkers: this.pauseOnMarkers,
        audioUrl: this.audioUrl,
      },
    );

    const config = {
      isPausable: !!this.driver.pause,
      isSeekable: !!this.driver.seek,
    };

    this._installDriverDefaults();

    if (this.driver.init) {
      await this.driver.init();
    }

    if (this.autoPlay) {
      await this.driver.play();
    }

    this._dispatchEvent("ready", config);
  }

  _installDriverDefaults() {
    if (this.driver.stop === undefined) {
      this.driver.stop = () => {};
    }

    if (this.driver.pause === undefined) {
      this.driver.pause = () => {};
    }

    if (this.driver.seek === undefined) {
      this.driver.seek = (_where) => false;
    }

    if (this.driver.step === undefined) {
      this.driver.step = (_n) => {};
    }

    if (this.driver.mute === undefined) {
      this.driver.mute = () => {};
    }

    if (this.driver.unmute === undefined) {
      this.driver.unmute = () => {};
    }

    if (this.driver.getDuration === undefined) {
      this.driver.getDuration = () => {};
    }

    if (this.driver.getCurrentTime === undefined) {
      const play = this.driver.play;
      let clock = new NullClock();

      this.driver.play = () => {
        clock = new Clock(this.speed);
        return play();
      };

      this.driver.getCurrentTime = () => clock.getTime();
    }
  }

  _enqueue(command) {
    const run = async () => {
      await this.init();
      return command.call(this);
    };

    const result = this.commandQueue.then(run, run);
    this.commandQueue = result.catch(() => {});

    return result;
  }

  play() {
    return this._enqueue(function () {
      return this.driver.play();
    });
  }

  pause() {
    return this._enqueue(function () {
      return this.driver.pause();
    });
  }

  seek(where) {
    return this._enqueue(function () {
      return this.driver.seek(where);
    });
  }

  step(n) {
    return this._enqueue(function () {
      return this.driver.step(n);
    });
  }

  stop() {
    return this._enqueue(function () {
      return this.driver.stop();
    });
  }

  mute() {
    return this._enqueue(function () {
      return this.driver.mute();
    });
  }

  unmute() {
    return this._enqueue(function () {
      return this.driver.unmute();
    });
  }

  getCurrentTime() {
    if (!this.driver) {
      return 0;
    }

    return this.driver.getCurrentTime();
  }

  getRemainingTime() {
    const duration = this.getDuration();

    if (typeof duration === "number") {
      return duration - Math.min(this.getCurrentTime(), duration);
    }
  }

  getProgress() {
    const duration = this.getDuration();

    if (typeof duration === "number") {
      return Math.min(this.getCurrentTime(), duration) / duration;
    }
  }

  getDuration() {
    if (!this.driver) {
      return undefined;
    }

    return this.driver.getDuration();
  }

  addEventListener(eventName, handler) {
    this.eventHandlers.get(eventName).push(handler);
  }

  removeEventListener(eventName, handler) {
    const handlers = this.eventHandlers.get(eventName);

    if (!handlers) return;

    const idx = handlers.indexOf(handler);
    if (idx !== -1) handlers.splice(idx, 1);
  }

  _dispatchEvent(eventName, data = {}) {
    for (const h of this.eventHandlers.get(eventName)) {
      h(data);
    }
  }

  _parsePoster(poster) {
    if (typeof poster !== "string") return;

    if (poster.substring(0, 16) == "data:text/plain,") {
      return { type: "text", value: poster.substring(16) };
    } else if (poster.substring(0, 4) == "npt:") {
      return { type: "npt", value: parseNpt(poster.substring(4)) };
    }

    return;
  }
}

const DRIVERS = new Map([
  ["benchmark", benchmark],
  ["clock", clock],
  ["eventsource", eventsource],
  ["random", random],
  ["recording", recording],
  ["websocket", websocket],
]);

const PARSERS = new Map([
  ["asciicast", parseAsciicast],
  ["typescript", parseTypescript],
  ["ttyrec", parseTtyrec],
]);

function getDriver(src) {
  if (typeof src === "function") return src;

  if (typeof src === "string") {
    if (src.substring(0, 5) == "ws://" || src.substring(0, 6) == "wss://") {
      src = { driver: "websocket", url: src };
    } else if (src.substring(0, 6) == "clock:") {
      src = { driver: "clock" };
    } else if (src.substring(0, 7) == "random:") {
      src = { driver: "random" };
    } else if (src.substring(0, 10) == "benchmark:") {
      src = { driver: "benchmark", url: src.substring(10) };
    } else {
      src = { driver: "recording", url: src };
    }
  }

  if (src.driver === undefined) {
    src.driver = "recording";
  }

  if (src.driver == "recording") {
    if (src.parser === undefined) {
      src.parser = "asciicast";
    }

    if (typeof src.parser === "string") {
      if (PARSERS.has(src.parser)) {
        src.parser = PARSERS.get(src.parser);
      } else {
        throw new Error(`unknown parser: ${src.parser}`);
      }
    }
  }

  if (DRIVERS.has(src.driver)) {
    const driver = DRIVERS.get(src.driver);
    return (callbacks, opts) => driver(src, callbacks, opts);
  } else {
    throw new Error(`unsupported driver: ${JSON.stringify(src)}`);
  }
}

export default Core;
