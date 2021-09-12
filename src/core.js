import loadVt from "./../vt-js/Cargo.toml";
import {asciicast} from "./driver/asciicast";
import {test} from "./driver/test";
import {websocket} from "./driver/websocket";
const vt = loadVt(); // trigger async loading of wasm


class AsciinemaPlayerCore {
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

    return new AsciinemaPlayerCore(drv, opts);
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
    this.onSize = opts.onSize;
    this.onFinish = opts.onFinish;
  }

  init() {
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

        if (this.onFinish) {
          this.onFinish();
        }
      }
    }

    this.driver = this.driverFn(
      { feed, now, setTimeout, setInterval, onFinish },
      { cols: this.cols, rows: this.rows }
    );

    if (typeof this.driver === 'function') {
      this.driver = { start: this.driver };
    }

    if (this.onSize && this.driver.cols) {
      this.onSize(this.driver.cols, this.driver.rows);
    }
  }

  async preload() {
    await this.ensureVt();
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
    if (this.driver.stop) {
      this.driver.stop();
    }
  }

  async seek(where) {
    if (this.driver.seek) {
      await this.ensureVt();

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
    if (this.driver.getCurrentTime) {
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

  isSeekable() {
    return !!this.driver.seek
  }

  isPausable() {
    return !!this.driver.pauseOrResume
  }

  // private

  async start() {
    await this.ensureVt();
    const stop = await this.driver.start();

    if (typeof stop === 'function') {
      this.driver.stop = stop;
    }

    this.startTime = this.now();
    this.state = 'playing';
  }

  pause() {
    if (this.driver.pauseOrResume) {
      this.driver.pauseOrResume();
      this.state = 'paused';
    }
  }

  resume() {
    if (this.driver.pauseOrResume) {
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
  }

  now() { return performance.now() * this.speed }

  async ensureVt() {
    if (this.vt) { return }

    let driverMeta = {};

    if (this.driver.init) {
      driverMeta = await this.driver.init();
    }

    this.duration = driverMeta.duration ?? this.driver.duration;
    const cols = this.cols ?? driverMeta.cols ?? this.driver.cols ?? 80;
    const rows = this.rows ?? driverMeta.rows ?? this.driver.rows ?? 24;
    const { create } = await vt;
    this.vt = create(cols, rows);

    for (let i = 0; i < rows; i++) {
      this.changedLines.add(i);
    }

    if (this.onSize) {
      this.onSize(cols, rows);
    }
  }
}

export default AsciinemaPlayerCore;
