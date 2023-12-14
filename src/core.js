import loadVt from "./vt/Cargo.toml";
import { parseNpt } from "./util";
import { Clock, NullClock } from './clock';
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
  seek(where) { return false; }
  step() {}
  stop() { this.driver.stop(); }
}

class UninitializedState extends State {
  async init() {
    try {
      await this.core.initializeDriver();
      return this.core.setState('stopped');
    } catch (e) {
      this.core.setState('errored');
      throw e;
    }
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
    this.duration = undefined;
    this.cols = opts.cols;
    this.rows = opts.rows;
    this.speed = opts.speed ?? 1.0;
    this.loop = opts.loop;
    this.idleTimeLimit = opts.idleTimeLimit;
    this.preload = opts.preload;
    this.startAt = parseNpt(opts.startAt);
    this.poster = this.parsePoster(opts.poster);
    this.markers = this.normalizeMarkers(opts.markers);
    this.pauseOnMarkers = opts.pauseOnMarkers;
    this.commandQueue = Promise.resolve();
    this.searchTerm = opts.searchTerm;
    this.onSearchClick = opts.onSearchClick;

    this.eventHandlers = new Map([
      ['marker', []],
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
      ['resize', []],
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
    const onMarker = ({ index, time, label }) => { this.dispatchEvent('marker', { index, time, label }) };
    const now = this.now.bind(this);
    const setTimeout = (f, t) => window.setTimeout(f, t / this.speed);
    const setInterval = (f, t) => window.setInterval(f, t / this.speed);
    const reset = this.resetVt.bind(this);
    const setState = this.setState.bind(this);

    const posterTime = this.poster.type === 'npt'
      ? this.poster.value
      : undefined;

    this.driver = this.driverFn(
      { feed, onInput, onMarker, reset, now, setTimeout, setInterval, setState, logger: this.logger },
      {
        cols: this.cols,
        rows: this.rows,
        idleTimeLimit: this.idleTimeLimit,
        startAt: this.startAt,
        loop: this.loop,
        posterTime: posterTime,
        markers: this.markers,
        pauseOnMarkers: this.pauseOnMarkers,
        searchTerm: this.searchTerm
      }
    );

    if (typeof this.driver === 'function') {
      this.driver = { play: this.driver };
    }

    if (this.preload || posterTime !== undefined) {
      this.withState(state => state.init());
    }

    const poster = this.poster.type === 'text'
      ? this.renderPoster(this.poster.value)
      : undefined;

    const config = {
      isPausable: !!this.driver.pause,
      isSeekable: !!this.driver.seek,
      poster
    };

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
      const play = this.driver.play;
      let clock = new NullClock();

      this.driver.play = () => {
        clock = new Clock(this.speed);
        return play();
      };

      this.driver.getCurrentTime = () => clock.getTime();
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
    return this.enqueueCommand(() => f(this.state));
  }

  enqueueCommand(f) {
    this.commandQueue = this.commandQueue.then(f);

    return this.commandQueue;
  }

  getChangedLines() {
    if (this.changedLines.size > 0) {
      const lines = new Map();
      const rows = this.vt.rows;

      /*
        We purposely split each character to a separate segment.
        So we would be able to control it through the search
       */
      for (const i of this.changedLines) {
        if (i < rows) {
          let line = this.vt.get_line(i);
          const segments = [];
          for (const lineWrapper of line) {
            for (const lineElement of lineWrapper[0]) {
              segments.push([lineElement, lineWrapper[1]]);
            }
          }
          lines.set(i, {id: i, segments: segments});
        }
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

  getSearchTerm() {
    return this.searchTerm;
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
    const [affectedLines, resized] = this.vt.feed(data);
    affectedLines.forEach(i => this.changedLines.add(i));
    this.cursor = undefined;

    if (resized) {
      const [cols, rows] = this.vt.get_size();
      this.vt.cols = cols;
      this.vt.rows = rows;
      this.logger.debug(`core: vt resize (${cols}x${rows})`);
      this.dispatchEvent('resize', { cols, rows });
    }
  }

  now() { return performance.now() * this.speed }

  async initializeDriver() {
    const meta = await this.driver.init();
    this.cols = this.cols ?? meta.cols ?? 80;
    this.rows = this.rows ?? meta.rows ?? 24;
    this.duration = this.duration ?? meta.duration;
    this.markers = this.normalizeMarkers(meta.markers) ?? this.markers ?? [];
    this.initializeVt(this.cols, this.rows);

    const poster = meta.poster !== undefined
      ? this.renderPoster(meta.poster)
      : undefined;

    this.dispatchEvent('init', {
      cols: this.cols,
      rows: this.rows,
      duration: this.duration,
      markers: this.markers,
      poster
    });
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

    this.vt = this.wasm.create(cols, rows, true, 100);
    this.vt.cols = cols;
    this.vt.rows = rows;

    this.changedLines.clear();

    for (let i = 0; i < rows; i++) {
      this.changedLines.add(i);
    }
  }

  parsePoster(poster) {
    if (typeof poster !== 'string') return {};

    if (poster.substring(0, 16) == "data:text/plain,") {
      return { type: 'text', value: [poster.substring(16)] };
    } else if (poster.substring(0, 4) == 'npt:') {
      return { type: 'npt', value: parseNpt(poster.substring(4)) };
    }

    return {};
  }

  renderPoster(poster) {
    const cols = this.cols ?? 80;
    const rows = this.rows ?? 24;

    this.logger.debug(`core: poster init (${cols}x${rows})`);

    const vt = this.wasm.create(cols, rows, false, 0);
    poster.forEach(text => vt.feed(text));
    const cursor = vt.get_cursor() ?? false;
    const lines = [];

    for (let i = 0; i < rows; i++) {
      lines.push({ id: i, segments: vt.get_line(i) });
    }

    return { cursor, lines };
  }

  normalizeMarkers(markers) {
    if (Array.isArray(markers)) {
      return markers.map(m => typeof m === 'number' ? [m, ''] : m);
    }
  }
}

export default Core;
