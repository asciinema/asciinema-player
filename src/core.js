import loadVt from "./../vt-js/Cargo.toml";
import {asciicast} from "./driver/asciicast";
import {test} from "./driver/test";
import {websocket} from "./driver/websocket";
const vt = loadVt(); // trigger async loading of wasm


class AsciinemaPlayerCore {
  // public

  constructor(drv, opts, onFinish) {
    const feed = this.feed.bind(this);

    this.driver = drv({ feed, onFinish }, opts);
    this.changedLines = new Set();
    this.duration = null;
    this.startTime = null;
  }

  static build(src, opts, onFinish) {
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

    return new AsciinemaPlayerCore(drv, opts, onFinish);
  }

  async start() {
    const { create } = await vt;
    let start = this.driver.start();
    let meta;

    if (start) {
      meta = await start;
    } else {
      meta = {};
    }

    meta.cols = meta.cols ?? this.driver.cols ?? 80;
    meta.rows = meta.rows ?? this.driver.rows ?? 24;
    meta.duration = this.duration = meta.duration ?? this.driver.duration;

    this.vt = create(meta.cols, meta.rows);
    this.startTime = (new Date()).getTime();

    for (let i = 0; i < meta.rows; i++) {
      this.changedLines.add(i);
    }

    return meta;
  }

  stop() {
    this.driver.stop();
  }

  pauseOrResume() {
    if (this.driver.pauseOrResume) {
      return this.driver.pauseOrResume();
    }
  }

  getChangedLines() {
    const lines = new Map();

    if (this.vt) {
      for (const i of this.changedLines) {
        lines.set(i, {id: i, segments: this.vt.get_line(i)});
      }

      this.changedLines.clear();
    }

    return lines;
  }

  getCursor() {
    if (this.vt) {
      return this.vt.get_cursor();
    }
  }

  getCurrentTime() {
    if (this.driver.getCurrentTime) {
      return this.driver.getCurrentTime();
    } else if (this.startTime) {
      return ((new Date).getTime() - this.startTime) / 1000;
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

  feed(data) {
    const affectedLines = this.vt.feed(data);
    affectedLines.forEach(i => this.changedLines.add(i));
  }
}

export default AsciinemaPlayerCore;
