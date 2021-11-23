import { render } from 'solid-js/web';
import Player from './components/Player';
import { asciicast } from "./driver/asciicast";
import { test } from "./driver/test";
import { websocket } from "./driver/websocket";
import { eventsource } from "./driver/eventsource";

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
