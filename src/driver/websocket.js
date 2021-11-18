import { Queue } from "../queue";

function websocket(url, { feed }) {
  const queue = new Queue();
  let socket;
  let startTime;
  let bufferTime = 1000; // 1 sec

  withEachItem(queue, async event => {
    if (event[1] != 'o') return;

    const elapsedWallTime = (new Date()).getTime() - startTime;
    const elapsedStreamTime = (event[0] * 1000) + bufferTime;

    if (elapsedStreamTime > elapsedWallTime) {
      await new Promise(resolve => {
        setTimeout(resolve, elapsedStreamTime - elapsedWallTime);
      });
    }

    feed(event[2]);
  });

  return {
    start: () => {
      socket = new WebSocket(url);

      socket.onmessage = (event) => {
        if (startTime === undefined) {
          startTime = (new Date()).getTime();
        }

        queue.push(JSON.parse(event.data));
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

export { websocket };
