import { Queue } from "../queue";

function websocket({ url }, { feed }) {
  const queue = new Queue();
  let socket;
  let startTime;
  let bufferTime = 1000; // 1 sec

  withEachItem(queue, async event => {
    if (event[1] != 'o') return;

    const elapsedWallTime = (new Date()).getTime() - startTime;
    const elapsedStreamTime = (event[0] * 1000) + bufferTime;

    if (elapsedStreamTime > elapsedWallTime) {
      await sleep(elapsedStreamTime - elapsedWallTime);
    }

    feed(event[2]);
  });

  return {
    start: () => {
      socket = new WebSocket(url);
      socket.binaryType = 'arraybuffer';

      socket.onmessage = event => {
        if (startTime === undefined) {
          startTime = (new Date()).getTime();
        }

        if (typeof event.data === 'string') {
          queue.push(JSON.parse(event.data));
        } else {
          const time = ((new Date()).getTime() - startTime) / 1000;
          const data = String.fromCharCode.apply(null, new Uint8Array(event.data));
          queue.push([time, 'o', data]);
        }
      }
    },

    stop: () => {
      socket.close();
    }
  }
}

function withEachItem(queue, f) {
  const go = async () => {
    let event = queue.pop();

    while (typeof event !== 'object' || typeof event.then !== 'function') {
      await f(event);
      event = queue.pop();
    }

    event = await event;
    await f(event);
    go();
  }

  setTimeout(go, 0);
}

function sleep(t) {
  return new Promise(resolve => {
    setTimeout(resolve, t);
  });
}

export { websocket };
