import loadVt from "./vt/Cargo.toml";
import { asciicast } from "./driver/asciicast";
import { test } from "./driver/test";
import { websocket } from "./driver/websocket";
import { parseNpt } from "./util";
const vt = loadVt(); // trigger async loading of wasm


class Core {
  // public

  static build(src, opts) {
    if (typeof src === 'string') {
      if (src.substring(0, 5) == 'ws://' || src.substring(0, 6) == 'wss://') {
        src = { driver: 'websocket', url: src };
      } else if (src.substring(0, 7) == 'test://') {
        src = { driver: 'test', kind: src.substring(7) };
      } else {
        src = { driver: 'asciicast', url: src };
      }
    }

    let drv;

    if (typeof src === 'function') {
      drv = src;
    } else if (src.driver == 'asciicast') {
      drv = (callbacks, opts) => asciicast(src.url, callbacks, opts);
    } else if (src.driver == 'websocket') {
      drv = (callbacks, opts) => websocket(src.url, callbacks, opts);
    } else if (src.driver == 'test') {
      drv = (callbacks, opts) => test(src.kind, callbacks, opts);
    } else {
      throw `unsupported driver: ${JSON.stringify(src)}`;
    }

    return new Core(drv, opts);
  }

  constructor(driverFn, opts) {
    this.state = 'initial';
    this.driver = null;
    this.driverFn = driverFn;
    this.changedLines = new Set();
    this.cursor = undefined;
    this.duration = null;
    this.cols = opts.cols;
    this.rows = opts.rows;
    this.startTime = null;
    this.speed = opts.speed ?? 1.0;
    this.loop = opts.loop;
    this.idleTimeLimit = opts.idleTimeLimit;
    this.preload = opts.preload;
    this.startAt = opts.startAt;
    this.poster = opts.poster;
    this.onSize = opts.onSize;
    this.onFinish = opts.onFinish;
    this.onTerminalUpdate = opts.onTerminalUpdate;
  }

  async init() {
    let playCount = 0;
    const feed = this.feed.bind(this);
    const now = this.now.bind(this);
    const setTimeout = (f, t) => window.setTimeout(f, t / this.speed);
    const setInterval = (f, t) => window.setInterval(f, t / this.speed);

    const onFinish = () => {
      playCount++;

      if (this.loop === true || (typeof this.loop === 'number' && playCount < this.loop)) {
        this.restart();
      } else {
        this.state = 'finished';

        if (typeof this.onFinish === 'function') {
          this.onFinish();
        }
      }
    }

    this.driver = this.driverFn(
      { feed, now, setTimeout, setInterval, onFinish },
      { cols: this.cols, rows: this.rows, idleTimeLimit: this.idleTimeLimit }
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

  async pauseOrResume() {
    if (this.state == 'initial') {
      await this.start();
    } else if (this.state == 'playing') {
      this.pause();
    } else if (this.state == 'paused') {
      this.resume();
    } else if (this.state == 'finished') {
      await this.restart();
    }

    return this.state == 'playing';
  }

  stop() {
    if (typeof this.driver.stop === 'function') {
      this.driver.stop();
    }
  }

  async seek(where) {
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
    } else if (this.startTime) {
      return (this.now() - this.startTime) / 1000;
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

  // private

  async start() {
    await this.initializeDriver();
    this.onTerminalUpdate(); // clears the poster
    const stop = await this.driver.start(this.startAt);

    if (typeof stop === 'function') {
      this.driver.stop = stop;
    }

    this.startTime = this.now();
    this.state = 'playing';
  }

  pause() {
    if (typeof this.driver.pauseOrResume === 'function') {
      this.driver.pauseOrResume();
      this.state = 'paused';
    }
  }

  resume() {
    if (typeof this.driver.pauseOrResume === 'function') {
      this.state = 'playing';
      this.driver.pauseOrResume();
    }
  }

  async restart() {
    if (await this.seek(0)) {
      this.resume();
    }
  }

  feed(data) {
    const affectedLines = this.vt.feed(data);
    affectedLines.forEach(i => this.changedLines.add(i));
    this.cursor = undefined;
    this.onTerminalUpdate();
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

    await this.initializeVt();
  }

  async initializeVt() {
    const cols = this.cols ?? 80;
    const rows = this.rows ?? 24;

    if (this.vt !== undefined && this.vt.cols === cols && this.vt.rows === rows) {
      return;
    }

    const { create } = await vt;

    this.vt = create(cols, rows);
    this.vt.cols = cols;
    this.vt.rows = rows;

    this.changedLines.clear();

    for (let i = 0; i < rows; i++) {
      this.changedLines.add(i);
    }

    if (typeof this.onSize === 'function') {
      this.onSize(cols, rows);
    }
  }

  async renderPoster() {
    if (!this.poster) return;

    await this.initializeVt();

    let poster = [];

    if (this.poster.substring(0, 16) == "data:text/plain,") {
      poster = [this.poster.substring(16)];
    } else if (this.poster.substring(0, 4) == 'npt:' && typeof this.driver.getPoster === 'function') {
      await this.initializeDriver();
      poster = this.driver.getPoster(this.parseNptPoster(this.poster));
    }

    poster.forEach(text => this.vt.feed(text));

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
