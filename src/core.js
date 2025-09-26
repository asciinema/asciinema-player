import loadVt from "./vt/Cargo.toml";
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
const vt = loadVt(); // trigger async loading of wasm

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

  seek(where) {
    if (this.driver.seek(where) === true) {
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
    this.cursor = undefined;
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
    this.commandQueue = Promise.resolve();

    this.eventHandlers = new Map([
      ["ended", []],
      ["errored", []],
      ["idle", []],
      ["input", []],
      ["loading", []],
      ["marker", []],
      ["metadata", []],
      ["offline", []],
      ["pause", []],
      ["play", []],
      ["playing", []],
      ["ready", []],
      ["reset", []],
      ["resize", []],
      ["seeked", []],
      ["terminalUpdate", []],
    ]);
  }

  async init() {
    this.wasm = await vt;

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

    const posterTime = this.poster.type === "npt" ? this.poster.value : undefined;

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

    const poster = this.poster.type === "text" ? this._renderPoster(this.poster.value) : null;

    const config = {
      isPausable: !!this.driver.pause,
      isSeekable: !!this.driver.seek,
      poster,
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
    }
  }

  play() {
    return this._withState((state) => state.play());
  }

  pause() {
    return this._withState((state) => state.pause());
  }

  togglePlay() {
    return this._withState((state) => state.togglePlay());
  }

  seek(where) {
    return this._withState(async (state) => {
      if (await state.seek(where)) {
        this._dispatchEvent("seeked");
      }
    });
  }

  step(n) {
    return this._withState((state) => state.step(n));
  }

  stop() {
    return this._withState((state) => state.stop());
  }

  getChanges() {
    const changes = {};

    if (this.changedLines.size > 0) {
      const lines = new Map();
      const rows = this.vt.rows;

      for (const i of this.changedLines) {
        if (i < rows) {
          lines.set(i, { id: i, segments: this.vt.getLine(i) });
        }
      }

      this.changedLines.clear();

      changes.lines = lines;
    }

    if (this.cursor === undefined && this.vt) {
      this.cursor = this.vt.getCursor() ?? false;
      changes.cursor = this.cursor;
    }

    return changes;
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
      throw `invalid state: ${newState}`;
    }

    this.state.onEnter(data);

    return this.state;
  }

  _feed(data) {
    this._doFeed(data);
    this._dispatchEvent("terminalUpdate");
  }

  _doFeed(data) {
    const affectedLines = this.vt.feed(data);
    affectedLines.forEach((i) => this.changedLines.add(i));
    this.cursor = undefined;
  }

  async _initializeDriver() {
    const meta = await this.driver.init();
    this.cols = this.cols ?? meta.cols ?? 80;
    this.rows = this.rows ?? meta.rows ?? 24;
    this.duration = this.duration ?? meta.duration;
    this.markers = this._normalizeMarkers(meta.markers) ?? this.markers ?? [];

    if (this.cols === 0) {
      this.cols = 80;
    }

    if (this.rows === 0) {
      this.rows = 24;
    }

    this._initializeVt(this.cols, this.rows);

    const poster = meta.poster !== undefined ? this._renderPoster(meta.poster) : null;

    this._dispatchEvent("metadata", {
      cols: this.cols,
      rows: this.rows,
      duration: this.duration,
      markers: this.markers,
      theme: meta.theme,
      poster,
    });
  }

  _resetVt(cols, rows, init = undefined, theme = undefined) {
    this.logger.debug(`core: vt reset (${cols}x${rows})`);
    this.cols = cols;
    this.rows = rows;
    this.cursor = undefined;
    this._initializeVt(cols, rows);

    if (init !== undefined && init !== "") {
      this._doFeed(init);
    }

    this._dispatchEvent("reset", { cols, rows, theme });
  }

  _resizeVt(cols, rows) {
    if (cols === this.vt.cols && rows === this.vt.rows) return;

    const affectedLines = this.vt.resize(cols, rows);
    affectedLines.forEach((i) => this.changedLines.add(i));
    this.cursor = undefined;
    this.vt.cols = cols;
    this.vt.rows = rows;
    this.logger.debug(`core: vt resize (${cols}x${rows})`);
    this._dispatchEvent("resize", { cols, rows });
  }

  _initializeVt(cols, rows) {
    this.vt = this.wasm.create(cols, rows, true, 100);
    this.vt.cols = cols;
    this.vt.rows = rows;

    this.changedLines.clear();

    for (let i = 0; i < rows; i++) {
      this.changedLines.add(i);
    }
  }

  _parsePoster(poster) {
    if (typeof poster !== "string") return {};

    if (poster.substring(0, 16) == "data:text/plain,") {
      return { type: "text", value: [poster.substring(16)] };
    } else if (poster.substring(0, 4) == "npt:") {
      return { type: "npt", value: parseNpt(poster.substring(4)) };
    }

    return {};
  }

  _renderPoster(poster) {
    const cols = this.cols ?? 80;
    const rows = this.rows ?? 24;

    this.logger.debug(`core: poster init (${cols}x${rows})`);

    const vt = this.wasm.create(cols, rows, false, 0);
    poster.forEach((text) => vt.feed(text));
    const cursor = vt.getCursor() ?? false;
    const lines = [];

    for (let i = 0; i < rows; i++) {
      lines.push({ id: i, segments: vt.getLine(i) });
    }

    return { cursor, lines };
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
        throw `unknown parser: ${src.parser}`;
      }
    }
  }

  if (DRIVERS.has(src.driver)) {
    const driver = DRIVERS.get(src.driver);
    return (callbacks, opts) => driver(src, callbacks, opts);
  } else {
    throw `unsupported driver: ${JSON.stringify(src)}`;
  }
}

export default Core;
