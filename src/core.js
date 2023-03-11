import loadVt from "./vt/Cargo.toml";
import { parseNpt } from "./util";
import Clock from './clock';
const vt = loadVt(); // trigger async loading of wasm


class Core {
  // public

  constructor(driverFn, opts) {
    this.logger = opts.logger;
    this.state = 'initial';
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
      ['starting', []],
      ['waiting', []],
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
    const feed = this.feed.bind(this);
    const now = this.now.bind(this);
    const setTimeout = (f, t) => window.setTimeout(f, t / this.speed);
    const setInterval = (f, t) => window.setInterval(f, t / this.speed);
    const reset = this.resetVt.bind(this);

    const onFinish = () => {
      this.state = 'finished';
      this.dispatchEvent('ended');
    }

    let wasWaiting = false;

    const setWaiting = (isWaiting) => {
      if (isWaiting && !wasWaiting) {
        wasWaiting = true;
        this.dispatchEvent('waiting');
      } else if (!isWaiting && wasWaiting) {
        wasWaiting = false;
        this.dispatchEvent('play');
      }
    };

    this.wasm = await vt;

    this.driver = this.driverFn(
      { feed, now, setTimeout, setInterval, onFinish, reset, setWaiting, logger: this.logger },
      { cols: this.cols, rows: this.rows, idleTimeLimit: this.idleTimeLimit, startAt: this.startAt, loop: this.loop }
    );

    if (typeof this.driver === 'function') {
      this.driver = { start: this.driver };
    }

    this.duration = this.driver.duration;
    this.cols = this.cols ?? this.driver.cols;
    this.rows = this.rows ?? this.driver.rows;

    if (this.preload) {
      this.initializeDriver();
    }

    return {
      isPausable: !!this.driver.pauseOrResume,
      isSeekable: !!this.driver.seek,
      poster: await this.renderPoster()
    }
  }

  async play() {
    if (this.state == 'initial') {
      await this.start();
    } else if (this.state == 'paused') {
      this.resume();
    } else if (this.state == 'finished') {
      this.restart();
    }
  }

  pause() {
    if (this.state == 'playing') {
      this.doPause();
    }
  }

  async pauseOrResume() {
    if (this.state == 'initial') {
      await this.start();
    } else if (this.state == 'playing') {
      this.doPause();
    } else if (this.state == 'paused') {
      this.resume();
    } else if (this.state == 'finished') {
      await this.restart();
    }
  }

  stop() {
    if (typeof this.driver.stop === 'function') {
      this.driver.stop();
    }
  }

  async seek(where) {
    await this.doSeek(where);
    this.dispatchEvent('seeked');
  }

  step() {
    if (this.state == 'paused' && typeof this.driver.step === 'function') {
      this.driver.step();
    }
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
    if (typeof this.driver.getCurrentTime === 'function') {
      return this.driver.getCurrentTime();
    } else if (this.clock !== undefined) {
      return this.clock.getTime();
    }
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

  async start() {
    this.dispatchEvent('starting');

    const timeoutId = setTimeout(() => {
      this.dispatchEvent('waiting');
    }, 2000);

    await this.initializeDriver();
    this.dispatchEvent('terminalUpdate'); // clears the poster
    const stop = await this.driver.start();
    clearTimeout(timeoutId);

    if (typeof stop === 'function') {
      this.driver.stop = stop;
    }

    this.clock = new Clock(this.speed);
    this.state = 'playing';
    this.dispatchEvent('play');
  }

  doPause() {
    if (typeof this.driver.pauseOrResume === 'function') {
      this.driver.pauseOrResume();
      this.state = 'paused';
      this.dispatchEvent('pause');
    }
  }

  resume() {
    if (typeof this.driver.pauseOrResume === 'function') {
      this.state = 'playing';
      this.driver.pauseOrResume();
      this.dispatchEvent('play');
    }
  }

  async doSeek(where) {
    if (typeof this.driver.seek === 'function') {
      await this.initializeDriver();

      if (this.state != 'playing') {
        this.state = 'paused';
      }

      this.driver.seek(where);

      return true;
    } else {
      return false;
    }
  }

  async restart() {
    if (await this.doSeek(0)) {
      this.resume();
      this.dispatchEvent('play');
    }
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

  initializeDriver() {
    if (this.initializeDriverPromise === undefined) {
      this.initializeDriverPromise = this.doInitializeDriver();
    }

    return this.initializeDriverPromise;
  }

  async doInitializeDriver() {
    if (typeof this.driver.init === 'function') {
      const meta = await this.driver.init();

      this.duration = this.duration ?? meta.duration;
      this.cols = this.cols ?? meta.cols;
      this.rows = this.rows ?? meta.rows;
    }

    this.ensureVt();
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

    let poster = [];

    if (this.poster.substring(0, 16) == "data:text/plain,") {
      poster = [this.poster.substring(16)];
    } else if (this.poster.substring(0, 4) == 'npt:' && typeof this.driver.getPoster === 'function') {
      await this.initializeDriver();
      poster = this.driver.getPoster(this.parseNptPoster(this.poster));
    }

    poster.forEach(text => this.vt.feed(text));

    this.cursor = undefined;
    const cursor = this.getCursor();
    const lines = [];

    for (let i = 0; i < this.vt.rows; i++) {
      lines.push({ id: i, segments: this.vt.get_line(i) });
      this.changedLines.add(i);
    }

    this.vt.feed('\x1bc'); // reset vt
    this.cursor = undefined;

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
