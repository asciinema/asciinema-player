import {create} from "./vt-js/pkg/vt_js";
import AsciicastDriver from "./driver/asciicast";
import PhoenixChannelDriver from "./driver/phoenix_channel";
import TestDriver from "./driver/test";
import WebsocketDriver from "./driver/websocket";


class AsciinemaPlayerCore {
  // public

  constructor(url, opts) {
    let feed = this.feed.bind(this);

    var driver;

    if (url.substring(0, 5) == 'ws://' || url.substring(0, 6) == 'wss://') {
        driver = new WebsocketDriver(feed, {width: 100, height: 30});
    } else if (url.substring(0, 6) == 'phx://') { // TODO support Phx via ws:// wss://
        driver = new PhoenixChannelDriver(feed, {width: 100, height: 30});
    } else if (url == 'test://random') {
        driver = new TestDriver('random', feed, {});
    } else {
        driver = new AsciicastDriver(url, feed, opts);
    }

    this.width = null;
    this.height = null;
    this.driver = driver;
    this.lines = [];
    this.changedLines = new Set();
  }

  static build(src, opts) {
    return new AsciinemaPlayerCore(src, opts);
  }

  load() {
    return this.driver.load().then(size => {
      this.width = size.width;
      this.height = size.height;

      return size;
    });
  }

  start(opts) {
    console.log('starting');

    let width = opts.width || this.width;
    let height = opts.height || this.height;

    this.vt = create(width, height);

    for (let i = 0; i < height; i++) {
      this.changedLines.add(i);
    }

    this.driver.start();
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

  // private

  feed(data) {
    const affectedLines = this.vt.feed(data);
    affectedLines.forEach(i => this.changedLines.add(i));
  }
}

export default AsciinemaPlayerCore;
