import { render } from 'solid-js/web';
import Core from './core';
import Player from './components/Player';
import Terminal from './components/Terminal';
import { DummyLogger } from './logging';
import recording from "./driver/recording";
import clock from "./driver/clock";
import random from "./driver/random";
import benchmark from "./driver/benchmark";
import websocket from "./driver/websocket";
import eventsource from "./driver/eventsource";
import parseAsciicast from "./parser/asciicast";
import parseTypescript from "./parser/typescript";
import parseTtyrec from "./parser/ttyrec";

const drivers = new Map([
  ['benchmark', benchmark],
  ['clock', clock],
  ['eventsource', eventsource],
  ['random', random],
  ['recording', recording],
  ['websocket', websocket],
]);

const parsers = new Map([
  ['asciicast', parseAsciicast],
  ['typescript', parseTypescript],
  ['ttyrec', parseTtyrec],
]);

function create(src, elem, opts = {}) {
  const logger = opts.logger ?? new DummyLogger();

  const core = new Core(getDriver(src), {
    logger: logger,
    cols: opts.cols,
    rows: opts.rows,
    loop: opts.loop,
    speed: opts.speed,
    preload: opts.preload,
    startAt: opts.startAt,
    poster: opts.poster,
    markers: opts.markers,
    pauseOnMarkers: opts.pauseOnMarkers,
    idleTimeLimit: opts.idleTimeLimit,
    searchTerm: opts.searchTerm
  });

  const metrics = measureTerminal(opts.terminalFontFamily, opts.terminalLineHeight);

  const props = {
    logger: logger,
    core: core,
    cols: opts.cols,
    rows: opts.rows,
    fit: opts.fit,
    controls: opts.controls ?? 'auto',
    autoPlay: opts.autoPlay ?? opts.autoplay,
    terminalFontSize: opts.terminalFontSize,
    terminalFontFamily: opts.terminalFontFamily,
    terminalLineHeight: opts.terminalLineHeight,
    theme: opts.theme,
    ...metrics
  };

  let el;

  const dispose = render(() => {
    el = <Player {...props} />;
    return el;
  }, elem);

  const player = {
    el: el,
    dispose: dispose,
    getCurrentTime: () => core.getCurrentTime(),
    getDuration: () => core.getDuration(),
    play: () => core.play(),
    pause: () => core.pause(),
    seek: pos => core.seek(pos)
  }

  player.addEventListener = (name, callback) => {
    return core.addEventListener(name, callback.bind(player));
  }

  return player;
}

function getDriver(src) {
  if (typeof src === 'function') return src;

  if (typeof src === 'string') {
    if (src.substring(0, 5) == 'ws://' || src.substring(0, 6) == 'wss://') {
      src = { driver: 'websocket', url: src };
    } else if (src.substring(0, 6) == 'clock:') {
      src = { driver: 'clock' };
    } else if (src.substring(0, 7) == 'random:') {
      src = { driver: 'random' };
    } else if (src.substring(0, 10) == 'benchmark:') {
      src = { driver: 'benchmark', url: src.substring(10) };
    } else {
      src = { driver: 'recording', url: src };
    }
  }

  if (src.driver === undefined) {
    src.driver = 'recording';
  }

  if (src.driver == 'recording') {
    if (src.parser === undefined) {
      src.parser = 'asciicast';
    }

    if (typeof src.parser === 'string') {
      if (parsers.has(src.parser)) {
        src.parser = parsers.get(src.parser);
      } else {
        throw `unknown parser: ${src.parser}`;
      }
    }
  }

  if (drivers.has(src.driver)) {
    const driver = drivers.get(src.driver);
    return (callbacks, opts) => driver(src, callbacks, opts);
  } else {
    throw `unsupported driver: ${JSON.stringify(src)}`;
  }
}

function measureTerminal(fontFamily, lineHeight) {
  const cols = 80;
  const rows = 24;
  const div = document.createElement("div");
  div.style.height = '0px';
  div.style.overflow = 'hidden';
  div.style.fontSize = '15px'; // must match font-size of div.asciinema-player in CSS
  document.body.appendChild(div);
  let el;

  const dispose = render(() => {
    el = <Terminal cols={cols} rows={rows} lineHeight={lineHeight} fontFamily={fontFamily} lines={[]} />;
    return el;
  }, div);

  const metrics = {
    charW: el.clientWidth / cols,
    charH: el.clientHeight / rows,
    bordersW: el.offsetWidth - el.clientWidth,
    bordersH: el.offsetHeight - el.clientHeight,
  };

  dispose();
  document.body.removeChild(div);

  return metrics;
}

export { create };
