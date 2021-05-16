import {create} from "./vt-js/pkg/vt_js";
import {asciicast} from "./driver/asciicast";
import {phoenixChannel} from "./driver/phoenix_channel";
import {test} from "./driver/test";
import {websocket} from "./driver/websocket";


class AsciinemaPlayerCore {
  // public

  constructor(src, opts) {
    let feed = this.feed.bind(this);

    if (src.driver == 'asciicast') {
      this.driver = asciicast(src.url, null, null, 1, feed);
    } else if (src.driver == 'websocket') {
      this.driver = websocket(src.url, null, null, feed);
    } else if (src.driver == 'phx_chan') {
      this.driver = phoenixChannel(src.socketUrl, src.channelName, null, null, feed);
    } else if (src.driver == 'test') {
      this.driver = test(src.kind, null, null, 1, feed);
    } else {
      throw `unsupported driver: ${JSON.stringify(src)}`;
    }

    this.lines = [];
    this.changedLines = new Set();
    this.duration = null;
    this.startTime = null;
  }

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

    return new AsciinemaPlayerCore(src, opts);
  }

  start() {
    let start = this.driver.start();

    if (!start) {
      start = Promise.resolve({
        width: this.driver.width,
        height: this.driver.height
      });
    }

    return start.then(meta => {
      this.vt = create(meta.width, meta.height);
      this.duration = meta.duration ?? this.driver.duration;
      this.startTime = (new Date()).getTime();

      for (let i = 0; i < meta.height; i++) {
        this.changedLines.add(i);
      }

      return meta;
    });
  }

  stop() {
    this.driver.stop();
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
