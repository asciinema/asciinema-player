import loadVt from "./vt/Cargo.toml";
import { parseNpt } from "./util";
import Clock from './clock';
const vt = loadVt(); // trigger async loading of wasm


class State {
  constructor(core) {
    this.core = core;
    this.driver = core.driver;
  }

  play() {}
  pause() {}
  seek(where) { return false; }
  step() {}
  stop() { this.driver.stop(); }
}

class UninitializedState extends State {
  async play() {
    await this.core.initializeDriver();
    return await this.core.play();
  }

  async seek(where) {
    await this.core.initializeDriver();
    return await this.core.seek(where);
  }

  async step() {
    await this.core.initializeDriver();
    return await this.core.step();
  }

  stop() {}
}

class StoppedState extends State {
  async play() {
    const stop = await this.driver.play();

    if (stop === true) {
      this.core.setState('playing');
    } else if (typeof stop === 'function') {
      this.core.setState('playing');
      this.driver.stop = stop;
    }

    this.core.initializeClock();
  }

  seek(where) {
    return this.driver.seek(where);
  }

  step() {
    this.driver.step();
  }
}

class PlayingState extends State {
  pause() {
    if (this.driver.pause()) {
      this.core.setState('stopped', { reason: 'paused' })
    }
  }

  seek(where) {
    return this.driver.seek(where);
  }
}

class LoadingState extends State {}

class Core {
  // public

  constructor(driverFn, opts) {
    this.logger = opts.logger;
    this.state = new UninitializedState(this);
    this.driver = null;
    this.driverFn = driverFn;
    this.changedLines = new Set();
    this.cursor = undefined;
    this.duration = null;
    this.cols = opts.cols;
    this.rows = opts.rows;
    this.speed = opts.speed ?? 1.0;
    this.clock = undefined;
    this.loop = opts.loop;
    this.idleTimeLimit = opts.idleTimeLimit;
    this.preload = opts.preload;
    this.startAt = parseNpt(opts.startAt);
    this.poster = opts.poster;

    this.eventHandlers = new Map([
      ['stateChanged', []],
      ['loading', []],
      ['reset', []],
      ['play', []],
      ['pause', []],
      ['terminalUpdate', []],
      ['seeked', []],
      ['ended', []]
    ]);
  }

  addEventListener(eventName, handler) {
    this.eventHandlers.get(eventName).push(handler);
  }

  dispatchEvent(eventName, data = {}) {
    for (const h of this.eventHandlers.get(eventName)) {
      h(data);
    }
  }

  async init() {
    this.wasm = await vt;

    const feed = this.feed.bind(this);
    const now = this.now.bind(this);
    const setTimeout = (f, t) => window.setTimeout(f, t / this.speed);
    const setInterval = (f, t) => window.setInterval(f, t / this.speed);
    const reset = this.resetVt.bind(this);
    const setState = this.setState.bind(this);

    this.driver = this.driverFn(
      { feed, reset, now, setTimeout, setInterval, setState, logger: this.logger },
      { cols: this.cols, rows: this.rows, idleTimeLimit: this.idleTimeLimit, startAt: this.startAt, loop: this.loop }
    );

    if (typeof this.driver === 'function') {
      this.driver = { play: this.driver };
    }

    this.duration = this.driver.duration;
    this.cols = this.cols ?? this.driver.cols;
    this.rows = this.rows ?? this.driver.rows;

    if (this.preload) {
      this.initializeDriver();
    }

    const config = {
      isPausable: !!this.driver.pause,
      isSeekable: !!this.driver.seek,
      poster: await this.renderPoster()
    }

    if (this.driver.init === undefined) {
      this.driver.init = () => { return {} };
    }

    if (this.driver.pause === undefined) {
      this.driver.pause = () => {};
    }

    if (this.driver.seek === undefined) {
      this.driver.seek = where => false;
    }

    if (this.driver.step === undefined) {
      this.driver.step = () => {};
    }

    if (this.driver.stop === undefined) {
      this.driver.stop = () => {};
    }

    if (this.driver.getCurrentTime === undefined) {
      this.driver.getCurrentTime = () => {
        if (this.clock !== undefined) {
          return this.clock.getTime();
        };
      }
    }

    return config;
  }

  async play() {
    await this.state.play();
  }

  pause() {
    this.state.pause();
  }

  async seek(where) {
    if (await this.state.seek(where)) {
      this.dispatchEvent('seeked');
    }
  }

  async step() {
    await this.state.step();
  }

  stop() {
    this.state.stop();
  }

  getChangedLines() {
    if (this.changedLines.size > 0) {
      const lines = new Map();

      for (const i of this.changedLines) {
        lines.set(i, {id: i, segments: this.vt.get_line(i)});
      }

      this.changedLines.clear();

      return lines;
    }
  }

  getCursor() {
    if (this.cursor === undefined && this.vt) {
      this.cursor = this.vt.get_cursor() ?? false;
    }

    return this.cursor;
  }

  getCurrentTime() {
    return this.driver.getCurrentTime();
  }

  getRemainingTime() {
    if (typeof this.duration === 'number') {
      return this.duration - Math.min(this.getCurrentTime(), this.duration);
    }
  }

  getProgress() {
    if (typeof this.duration === 'number') {
      return Math.min(this.getCurrentTime(), this.duration) / this.duration;
    }
  }

  getDuration() {
    return this.duration;
  }

  // private

  setState(newState, data = {}) {
    if (newState === 'playing') {
      this.state = new PlayingState(this);
      this.dispatchEvent('play');
    } else if (newState === 'stopped') {
      this.state = new StoppedState(this);

      if (data.reason === 'paused') {
        this.dispatchEvent('pause');
      } else if (data.reason === 'ended') {
        this.dispatchEvent('ended');
      }
    } else if (newState === 'loading') {
      this.state = new LoadingState(this);
      this.dispatchEvent('loading');
    } else {
      throw `invalid state: ${newState}`;
    }

    this.dispatchEvent('stateChanged', { newState, data });
  }

  feed(data) {
    this.doFeed(data);
    this.dispatchEvent('terminalUpdate');
  }

  doFeed(data) {
    const affectedLines = this.vt.feed(data);
    affectedLines.forEach(i => this.changedLines.add(i));
    this.cursor = undefined;
  }

  now() { return performance.now() * this.speed }

  initializeClock() {
    if (this.clock === undefined) {
      this.clock = new Clock(this.speed);
    }
  }

  initializeDriver() {
    if (this.initializeDriverPromise === undefined) {
      this.initializeDriverPromise = this.doInitializeDriver();
    }

    return this.initializeDriverPromise;
  }

  async doInitializeDriver() {
    const meta = await this.driver.init();
    this.duration = this.duration ?? meta.duration;
    this.cols = this.cols ?? meta.cols;
    this.rows = this.rows ?? meta.rows;
    this.ensureVt();
    this.state = new StoppedState(this);
  }

  ensureVt() {
    const cols = this.cols ?? 80;
    const rows = this.rows ?? 24;

    if (this.vt !== undefined && this.vt.cols === cols && this.vt.rows === rows) {
      return;
    }

    this.initializeVt(cols, rows);
    this.dispatchEvent('reset', { cols, rows });
  }

  resetVt(cols, rows, init = undefined) {
    this.cols = cols;
    this.rows = rows;
    this.cursor = undefined;
    this.initializeVt(cols, rows);

    if (init !== undefined && init !== '') {
      this.doFeed(init);
    }

    this.dispatchEvent('reset', { cols, rows });
  }

  initializeVt(cols, rows) {
    this.vt = this.wasm.create(cols, rows);
    this.vt.cols = cols;
    this.vt.rows = rows;

    this.changedLines.clear();

    for (let i = 0; i < rows; i++) {
      this.changedLines.add(i);
    }
  }

  async renderPoster() {
    if (!this.poster) return;

    this.ensureVt();

    // obtain poster text

    let poster = [];

    if (this.poster.substring(0, 16) == "data:text/plain,") {
      poster = [this.poster.substring(16)];
    } else if (this.poster.substring(0, 4) == 'npt:' && typeof this.driver.getPoster === 'function') {
      await this.initializeDriver();
      poster = this.driver.getPoster(this.parseNptPoster(this.poster));
    }

    // feed vt with poster text

    poster.forEach(text => this.vt.feed(text));

    // get cursor position and terminal lines

    const cursor = this.vt.get_cursor() ?? false;
    const lines = [];

    for (let i = 0; i < this.vt.rows; i++) {
      lines.push({ id: i, segments: this.vt.get_line(i) });
    }

    // clear terminal for next (post-poster) render

    this.doFeed('\x1bc'); // reset vt

    return {
      cursor: cursor,
      lines: lines
    }
  }

  parseNptPoster(poster) {
    return parseNpt(poster.substring(4));
  }
}

export default Core;
