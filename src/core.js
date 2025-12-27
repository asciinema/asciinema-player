import * as vtModule from "./vt/Cargo.toml?custom";
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

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;

const vt = vtModule.init({ module: vtModule.module }); // trigger async loading of wasm

class State {
  constructor(core) {
    this.core = core;
    this.driver = core.driver;
  }

  onEnter(data) {}
  init() {}
  play() {}
  pause() {}
  togglePlay() {}

  mute() {
    if (this.driver && this.driver.mute()) {
      this.core._dispatchEvent("muted", true);
    }
  }

  unmute() {
    if (this.driver && this.driver.unmute()) {
      this.core._dispatchEvent("muted", false);
    }
  }

  seek(where) {
    return false;
  }

  step(n) {}

  stop() {
    this.driver.stop();
  }
}

class UninitializedState extends State {
  async init() {
    try {
      await this.core._initializeDriver();
      return this.core._setState("idle");
    } catch (e) {
      this.core._setState("errored");
      throw e;
    }
  }

  async play() {
    this.core._dispatchEvent("play");
    const idleState = await this.init();
    await idleState.doPlay();
  }

  async togglePlay() {
    await this.play();
  }

  async seek(where) {
    const idleState = await this.init();
    return await idleState.seek(where);
  }

  async step(n) {
    const idleState = await this.init();
    await idleState.step(n);
  }

  stop() {}
}

class Idle extends State {
  onEnter({ reason, message }) {
    this.core._dispatchEvent("idle", { message });

    if (reason === "paused") {
      this.core._dispatchEvent("pause");
    }
  }

  async play() {
    this.core._dispatchEvent("play");
    await this.doPlay();
  }

  async doPlay() {
    const stop = await this.driver.play();

    if (stop === true) {
      this.core._setState("playing");
    } else if (typeof stop === "function") {
      this.core._setState("playing");
      this.driver.stop = stop;
    }
  }

  async togglePlay() {
    await this.play();
  }

  seek(where) {
    return this.driver.seek(where);
  }

  step(n) {
    this.driver.step(n);
  }
}

class PlayingState extends State {
  onEnter() {
    this.core._dispatchEvent("playing");
  }

  pause() {
    if (this.driver.pause() === true) {
      this.core._setState("idle", { reason: "paused" });
    }
  }

  togglePlay() {
    this.pause();
  }

  seek(where) {
    return this.driver.seek(where);
  }
}

class LoadingState extends State {
  onEnter() {
    this.core._dispatchEvent("loading");
  }
}

class OfflineState extends State {
  onEnter({ message }) {
    this.core._dispatchEvent("offline", { message });
  }
}

class EndedState extends State {
  onEnter({ message }) {
    this.core._dispatchEvent("ended", { message });
  }

  async play() {
    this.core._dispatchEvent("play");

    if (await this.driver.restart()) {
      this.core._setState('playing');
    }
  }

  async togglePlay() {
    await this.play();
  }

  async seek(where) {
    if (await this.driver.seek(where) === true) {
      this.core._setState('idle');
      return true;
    }

    return false;
  }
}

class ErroredState extends State {
  onEnter() {
    this.core._dispatchEvent("errored");
  }
}

class Core {
  constructor(src, opts) {
    this.logger = opts.logger;
    this.state = new UninitializedState(this);
    this.stateName = "uninitialized";
    this.driver = getDriver(src);
    this.changedLines = new Set();
    this.duration = undefined;
    this.cols = opts.cols;
    this.rows = opts.rows;
    this.speed = opts.speed;
    this.loop = opts.loop;
    this.autoPlay = opts.autoPlay;
    this.idleTimeLimit = opts.idleTimeLimit;
    this.preload = opts.preload;
    this.startAt = parseNpt(opts.startAt);
    this.poster = this._parsePoster(opts.poster);
    this.markers = this._normalizeMarkers(opts.markers);
    this.pauseOnMarkers = opts.pauseOnMarkers;
    this.audioUrl = opts.audioUrl;
    this.boldIsBright = opts.boldIsBright ?? false;
    this.commandQueue = Promise.resolve();
    this.needsClear = false;

    this.eventHandlers = new Map([
      ["ended", []],
      ["errored", []],
      ["idle", []],
      ["input", []],
      ["loading", []],
      ["marker", []],
      ["metadata", []],
      ["muted", []],
      ["offline", []],
      ["pause", []],
      ["play", []],
      ["playing", []],
      ["ready", []],
      ["seeked", []],
      ["vtUpdate", []],
    ]);
  }

  async init() {
    this.wasm = await vt;
    this._initializeVt(this.cols ?? DEFAULT_COLS, this.rows ?? DEFAULT_ROWS);

    const feed = this._feed.bind(this);

    const onInput = (data) => {
      this._dispatchEvent("input", { data });
    };

    const onMarker = ({ index, time, label }) => {
      this._dispatchEvent("marker", { index, time, label });
    };

    const reset = this._resetVt.bind(this);
    const resize = this._resizeVt.bind(this);
    const setState = this._setState.bind(this);

    const posterTime =
      this.poster.type === "npt" && !this.autoPlay
        ? this.poster.value
        : undefined;

    this.driver = this.driver(
      {
        feed,
        onInput,
        onMarker,
        reset,
        resize,
        setState,
        logger: this.logger,
      },
      {
        cols: this.cols,
        rows: this.rows,
        speed: this.speed,
        idleTimeLimit: this.idleTimeLimit,
        startAt: this.startAt,
        loop: this.loop,
        posterTime: posterTime,
        markers: this.markers,
        pauseOnMarkers: this.pauseOnMarkers,
        audioUrl: this.audioUrl,
      },
    );

    if (typeof this.driver === "function") {
      this.driver = { play: this.driver };
    }

    if (this.preload || posterTime !== undefined) {
      this._withState((state) => state.init());
    }

    const config = {
      isPausable: !!this.driver.pause,
      isSeekable: !!this.driver.seek,
    };

    if (this.driver.init === undefined) {
      this.driver.init = () => {
        return {};
      };
    }

    if (this.driver.pause === undefined) {
      this.driver.pause = () => {};
    }

    if (this.driver.seek === undefined) {
      this.driver.seek = (where) => false;
    }

    if (this.driver.step === undefined) {
      this.driver.step = (n) => {};
    }

    if (this.driver.stop === undefined) {
      this.driver.stop = () => {};
    }

    if (this.driver.restart === undefined) {
      this.driver.restart = () => {};
    }

    if (this.driver.mute === undefined) {
      this.driver.mute = () => {};
    }

    if (this.driver.unmute === undefined) {
      this.driver.unmute = () => {};
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

    this._dispatchEvent("ready", config);

    if (this.autoPlay) {
      this.play();
    } else if (this.poster.type === "text") {
      this._feed(this.poster.value);
    }
  }

  play() {
    this._clearIfNeeded();
    return this._withState((state) => state.play());
  }

  pause() {
    return this._withState((state) => state.pause());
  }

  togglePlay() {
    this._clearIfNeeded();
    return this._withState((state) => state.togglePlay());
  }

  seek(where) {
    this._clearIfNeeded();

    return this._withState(async (state) => {
      if (await state.seek(where)) {
        this._dispatchEvent("seeked");
      }
    });
  }

  step(n) {
    this._clearIfNeeded();
    return this._withState((state) => state.step(n));
  }

  stop() {
    return this._withState((state) => state.stop());
  }

  mute() {
    return this._withState((state) => state.mute());
  }

  unmute() {
    return this._withState((state) => state.unmute());
  }

  getLine(n, cursorOn) {
    return this.vt.getLine(n, cursorOn);
  }

  getCursor() {
    const cursor = this.vt.getCursor();

    if (cursor) {
      return { col: cursor[0], row: cursor[1], visible: true };
    }

    return { col: 0, row: 0, visible: false };
  }

  getCurrentTime() {
    return this.driver.getCurrentTime();
  }

  getRemainingTime() {
    if (typeof this.duration === "number") {
      return this.duration - Math.min(this.getCurrentTime(), this.duration);
    }
  }

  getProgress() {
    if (typeof this.duration === "number") {
      return Math.min(this.getCurrentTime(), this.duration) / this.duration;
    }
  }

  getDuration() {
    return this.duration;
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

  _withState(f) {
    return this._enqueueCommand(() => f(this.state));
  }

  _enqueueCommand(f) {
    this.commandQueue = this.commandQueue.then(f);

    return this.commandQueue;
  }

  _setState(newState, data = {}) {
    if (this.stateName === newState) return this.state;
    this.stateName = newState;

    if (newState === "playing") {
      this.state = new PlayingState(this);
    } else if (newState === "idle") {
      this.state = new Idle(this);
    } else if (newState === "loading") {
      this.state = new LoadingState(this);
    } else if (newState === "ended") {
      this.state = new EndedState(this);
    } else if (newState === "offline") {
      this.state = new OfflineState(this);
    } else if (newState === "errored") {
      this.state = new ErroredState(this);
    } else {
      throw new Error(`invalid state: ${newState}`);
    }

    this.state.onEnter(data);

    return this.state;
  }

  _feed(data) {
    const changedRows = this.vt.feed(data);
    this._dispatchEvent("vtUpdate", { changedRows });
  }

  async _initializeDriver() {
    const meta = await this.driver.init();
    this.cols = this.cols ?? meta.cols ?? DEFAULT_COLS;
    this.rows = this.rows ?? meta.rows ?? DEFAULT_ROWS;
    this.duration = this.duration ?? meta.duration;
    this.markers = this._normalizeMarkers(meta.markers) ?? this.markers ?? [];

    if (this.cols === 0) {
      this.cols = DEFAULT_COLS;
    }

    if (this.rows === 0) {
      this.rows = DEFAULT_ROWS;
    }

    this._initializeVt(this.cols, this.rows);

    if (meta.poster !== undefined) {
      this.needsClear = true;
      meta.poster.forEach((text) => this.vt.feed(text));
    }

    this._dispatchEvent("metadata", {
      size: { cols: this.cols, rows: this.rows },
      theme: meta.theme ?? null,
      duration: this.duration,
      markers: this.markers,
      hasAudio: meta.hasAudio,
    });

    this._dispatchEvent("vtUpdate", {
      size: { cols: this.cols, rows: this.rows },
      theme: meta.theme ?? null,
      changedRows: Array.from({ length: this.rows }, (_, i) => i),
    });
  }

  _clearIfNeeded() {
    if (this.needsClear) {
      this._feed('\x1bc');
      this.needsClear = false;
    }
  }

  _resetVt(cols, rows, init = undefined, theme = undefined) {
    this.logger.debug(`core: vt reset (${cols}x${rows})`);
    this.cols = cols;
    this.rows = rows;
    this._initializeVt(cols, rows);

    if (init !== undefined && init !== "") {
      this.vt.feed(init);
    }

    this._dispatchEvent("metadata", {
      size: { cols, rows },
      theme: theme ?? null,
    });

    this._dispatchEvent("vtUpdate", {
      size: { cols, rows },
      theme: theme ?? null,
      changedRows: Array.from({ length: rows }, (_, i) => i),
    });
  }

  _resizeVt(cols, rows) {
    if (cols === this.vt.cols && rows === this.vt.rows) return;

    const changedRows = this.vt.resize(cols, rows);
    this.vt.cols = cols;
    this.vt.rows = rows;
    this.logger.debug(`core: vt resize (${cols}x${rows})`);

    this._dispatchEvent("metadata", {
      size: { cols, rows },
    });

    this._dispatchEvent("vtUpdate", {
      size: { cols, rows },
      changedRows,
    });
  }

  _initializeVt(cols, rows) {
    this.logger.debug('vt init', { cols, rows });
    this.vt = this.wasm.create(cols, rows, 100, this.boldIsBright);
    this.vt.cols = cols;
    this.vt.rows = rows;
  }

  _parsePoster(poster) {
    if (typeof poster !== "string") return {};

    if (poster.substring(0, 16) == "data:text/plain,") {
      return { type: "text", value: poster.substring(16) };
    } else if (poster.substring(0, 4) == "npt:") {
      return { type: "npt", value: parseNpt(poster.substring(4)) };
    }

    return {};
  }

  _normalizeMarkers(markers) {
    if (Array.isArray(markers)) {
      return markers.map((m) => (typeof m === "number" ? [m, ""] : m));
    }
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
