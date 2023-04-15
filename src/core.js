import loadVt from "./vt/Cargo.toml";
import { parseNpt } from "./util";
import Clock from './clock';
const vt = loadVt(); // trigger async loading of wasm


class State {
  constructor(core) {
    this.core = core;
    this.driver = core.driver;
  }

  onEnter(data) {}
  preload() {}
  play() {}
  pause() {}
  togglePlay() {}
  seek(where) { return false; }
  step() {}
  stop() { this.driver.stop(); }
}

class UninitializedState extends State {
  preload() {
    return this.init();
  }

  async play() {
    this.core.dispatchEvent('play');
    const stoppedState = await this.init();
    return await stoppedState.doPlay();
  }

  togglePlay() {
    return this.play();
  }

  async seek(where) {
    const stoppedState = await this.init();
    return await stoppedState.seek(where);
  }

  async step() {
    const stoppedState = await this.init();
    return await stoppedState.step();
  }

  stop() {}

  async init() {
    try {
      await this.core.initializeDriver();
      return this.core.setState('stopped');
    } catch (e) {
      this.core.setState('errored');
      throw e;
    }
  }
}

class StoppedState extends State {
  onEnter(data) {
    this.core.dispatchEvent('stopped');

    if (data.reason === 'paused') {
      this.core.dispatchEvent('pause');
    } else if (data.reason === 'ended') {
      this.core.dispatchEvent('ended');
    }
  }

  play() {
    this.core.dispatchEvent('play');
    return this.doPlay();
  }

  async doPlay() {
    const stop = await this.driver.play();

    if (stop === true) {
      this.core.setState('playing');
    } else if (typeof stop === 'function') {
      this.core.setState('playing');
      this.driver.stop = stop;
    }

    this.core.initializeClock();
  }

  togglePlay() {
    return this.play();
  }

  seek(where) {
    return this.driver.seek(where);
  }

  step() {
    this.driver.step();
  }
}

class PlayingState extends State {
  onEnter() {
    this.core.dispatchEvent('playing');
  }

  pause() {
    if (this.driver.pause() === true) {
      this.core.setState('stopped', { reason: 'paused' })
    }
  }

  togglePlay() {
    return this.pause();
  }

  seek(where) {
    return this.driver.seek(where);
  }
}

class LoadingState extends State {
  onEnter() {
    this.core.dispatchEvent('loading');
  }
}

class OfflineState extends State {
  onEnter() {
    this.core.dispatchEvent('offline');
  }
}

class ErroredState extends State {
  onEnter() {
    this.core.dispatchEvent('errored');
  }
}

class Core {
  // public

  constructor(driverFn, opts) {
    this.logger = opts.logger;
    this.state = new UninitializedState(this);
    this.stateName = 'uninitialized';
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
    this.actionQueue = Promise.resolve();

    this.eventHandlers = new Map([
      ['ended', []],
      ['errored', []],
      ['init', []],
      ['input', []],
      ['loading', []],
      ['offline', []],
      ['pause', []],
      ['play', []],
      ['playing', []],
      ['reset', []],
      ['seeked', []],
      ['stopped', []],
      ['terminalUpdate', []],
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
    const onInput = data => { this.dispatchEvent('input', { data }) };
    const now = this.now.bind(this);
    const setTimeout = (f, t) => window.setTimeout(f, t / this.speed);
    const setInterval = (f, t) => window.setInterval(f, t / this.speed);
    const reset = this.resetVt.bind(this);
    const setState = this.setState.bind(this);

    this.driver = this.driverFn(
      { feed, onInput, reset, now, setTimeout, setInterval, setState, logger: this.logger },
      { cols: this.cols, rows: this.rows, idleTimeLimit: this.idleTimeLimit, startAt: this.startAt, loop: this.loop }
    );

    if (typeof this.driver === 'function') {
      this.driver = { play: this.driver };
    }

    this.duration = this.driver.duration;
    this.cols = this.cols ?? this.driver.cols;
    this.rows = this.rows ?? this.driver.rows;

    if (this.preload) {
      this.withState(state => state.preload());
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

  play() {
    return this.withState(state => state.play());
  }

  pause() {
    return this.withState(state => state.pause());
  }

  togglePlay() {
    return this.withState(state => state.togglePlay());
  }

  seek(where) {
    return this.withState(async state => {
      if (await state.seek(where)) {
        this.dispatchEvent('seeked');
      }
    });
  }

  step() {
    return this.withState(state => state.step());
  }

  stop() {
    return this.withState(state => state.stop());
  }

  withState(f) {
    return this.enqueueAction(() => f(this.state));
  }

  enqueueAction(f) {
    this.actionQueue = this.actionQueue.then(f);

    return this.actionQueue;
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
    if (this.stateName === newState) return this.state;
    this.stateName = newState;

    if (newState === 'playing') {
      this.state = new PlayingState(this);
    } else if (newState === 'stopped') {
      this.state = new StoppedState(this);
    } else if (newState === 'loading') {
      this.state = new LoadingState(this);
    } else if (newState === 'offline') {
      this.state = new OfflineState(this);
    } else if (newState === 'errored') {
      this.state = new ErroredState(this);
    } else {
      throw `invalid state: ${newState}`;
    }

    this.state.onEnter(data);

    return this.state;
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

  async initializeDriver() {
    const meta = await this.driver.init();
    this.duration = this.duration ?? meta.duration;
    this.cols = this.cols ?? meta.cols;
    this.rows = this.rows ?? meta.rows;
    this.ensureVt();
  }

  ensureVt() {
    const cols = this.cols ?? 80;
    const rows = this.rows ?? 24;

    if (this.vt !== undefined && this.vt.cols === cols && this.vt.rows === rows) {
      return;
    }

    this.initializeVt(cols, rows);
    this.dispatchEvent('init', { cols, rows });
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
    this.logger.debug(`core: vt init (${cols}x${rows})`);

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
      await this.withState(state => state.preload());
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
