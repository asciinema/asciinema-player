import { render } from 'solid-js/web';
import Player from './components/Player';
import { asciicast, parseAsciicast } from "./driver/asciicast";
import { test } from "./driver/test";
import { websocket } from "./driver/websocket";
import loadVt from "./vt/Cargo.toml";

function create(src, elem, opts = {}) {
  const props = { driverFn: getDriver(src), ...opts };
  let el;

  const dispose = render(() => {
    el = <Player {...props} />;
    return el;
  }, elem);

  return {
    el: el,
    dispose: dispose
  }
}

function getDriver(src) {
  if (typeof src === 'string') {
    if (src.substring(0, 5) == 'ws://' || src.substring(0, 6) == 'wss://') {
      src = { driver: 'websocket', url: src };
    } else if (src.substring(0, 7) == 'test://') {
      src = { driver: 'test', kind: src.substring(7) };
    } else {
      src = { driver: 'asciicast', url: src };
    }
  }

  const drivers = new Map([
    ['asciicast', asciicast],
    ['websocket', websocket],
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

async function benchmark(url, rounds = 10) {
  const res = await fetch(url);
  console.info('fetched recording');
  const asciicast = parseAsciicast(await res.text());
  console.info('parsed recording');
  const vtModule = await loadVt(); // trigger async loading of wasm
  const vt = vtModule.create(asciicast.cols, asciicast.rows);
  console.info('initialized vt');
  const frames = Array.from(asciicast.frames);
  const bytes = frames.reduce((sum, frame) => sum + new Blob([frame[1]]).size, 0) * rounds;
  console.info('prepared frames');
  const startTime = (new Date()).getTime();

  for (let i = 0; i < rounds; i++) {
    frames.forEach(frame => { vt.feed(frame[1]); });
  }

  const endTime = (new Date()).getTime();
  const duration = (endTime - startTime) / 1000;
  console.info('finished feeding');
  console.info(`time: ${duration}, bytes: ${bytes}, bytes/sec: ${bytes / duration}`);
}

export { create, benchmark };
