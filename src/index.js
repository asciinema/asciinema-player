import { render } from 'solid-js/web';
import Core from './core';
import Player from './components/Player';
import DummyLogger from './logging';
import { recording } from "./driver/recording";
import { test } from "./driver/test";
import { websocket } from "./driver/websocket";
import { eventsource } from "./driver/eventsource";

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
    idleTimeLimit: opts.idleTimeLimit
  });

  const props = {
    logger: logger,
    core: core,
    cols: opts.cols,
    rows: opts.rows,
    fit: opts.fit,
    autoPlay: opts.autoPlay ?? opts.autoplay,
    terminalFontSize: opts.terminalFontSize,
    terminalFontFamily: opts.terminalFontFamily,
    terminalLineHeight: opts.terminalLineHeight,
    theme: opts.theme
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
  if (typeof src === 'string') {
    if (src.substring(0, 5) == 'ws://' || src.substring(0, 6) == 'wss://') {
      src = { driver: 'websocket', url: src };
    } else if (src.substring(0, 7) == 'test://') {
      src = { driver: 'test', kind: src.substring(7) };
    } else {
      src = { driver: 'recording', url: src };
    }
  }

  if (src.driver === undefined) {
    src.driver = 'recording';
  }

  const drivers = new Map([
    ['recording', recording],
    ['websocket', websocket],
    ['eventsource', eventsource],
    ['test', test]
  ]);

  if (typeof src === 'function') {
    return src;
  } else if (drivers.has(src.driver)) {
    const driver = drivers.get(src.driver);
    return (callbacks, opts) => driver(src, callbacks, opts);
  } else {
    throw `unsupported driver: ${JSON.stringify(src)}`;
  }
}

export { create };
