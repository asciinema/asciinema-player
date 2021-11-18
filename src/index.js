import { render } from 'solid-js/web';
import Player from './components/Player';
import { asciicast } from "./driver/asciicast";
import { test } from "./driver/test";
import { websocket } from "./driver/websocket";

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

  return drv;
}

export { create };
