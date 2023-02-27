import Queue from "./queue";

function getBuffer(feed, bufferTime) {
  if (bufferTime > 0) {
    return buffer(feed, bufferTime);
  } else {
    return nullBuffer(feed);
  }
}

function nullBuffer(feed) {
  return {
    pushEvent(event) {
      if (event[1] === 'o') {
        feed(event[2]);
      }
    },

    pushText(text) {
      feed(text);
    },

    stop() {}
  }
}

function buffer(feed, bufferTime) {
  const queue = new Queue();
  const maxFrameTime = 1000.0 / 60;
  let startTime;
  let stop = false;
  let prevElapsedStreamTime = -maxFrameTime;

  setTimeout(async () => {
    while (!stop) {
      const events = await queue.popAll();
      if (stop) return;

      for (const event of events) {
        const elapsedStreamTime = (event[0] + bufferTime) * 1000;

        if (elapsedStreamTime - prevElapsedStreamTime < maxFrameTime) {
          feed(event[2]);
          continue;
        }

        prevElapsedStreamTime = elapsedStreamTime;
        const elapsedWallTime = now() - startTime;

        if (elapsedStreamTime > elapsedWallTime) {
          await sleep(elapsedStreamTime - elapsedWallTime);
          if (stop) return;
        }

        feed(event[2]);
      }
    }
  }, 0);

  return {
    pushEvent(event) {
      if (startTime === undefined) {
        startTime = now();
      }

      if (event[1] != 'o') return;

      queue.push(event);
    },

    pushText(text) {
      if (startTime === undefined) {
        startTime = now();
      }

      const time = (now() - startTime) / 1000;
      queue.push([time, 'o', text]);
    },

    stop() {
      stop = true;
      queue.push(undefined);
    }
  }
}

function now() {
  return (new Date()).getTime();
}

function sleep(t) {
  return new Promise(resolve => {
    setTimeout(resolve, t);
  });
}

export default getBuffer;
