import Queue from "./queue";

function getBuffer(feed, setTime, bufferTime, baseStreamTime, minFrameTime) {
  if (bufferTime > 0) {
    return buffer(feed, setTime, bufferTime, baseStreamTime ?? 0.0, minFrameTime);
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

function buffer(feed, setTime, bufferTime, baseStreamTime, minFrameTime = 1.0 / 60) {
  const queue = new Queue();
  const startWallTime = now();
  let stop = false;
  let prevElapsedStreamTime = -minFrameTime;

  setTimeout(async () => {
    while (!stop) {
      const events = await queue.popAll();
      if (stop) return;

      for (const event of events) {
        const elapsedStreamTime = event[0] - baseStreamTime + bufferTime;

        if (elapsedStreamTime - prevElapsedStreamTime < minFrameTime) {
          feed(event[2]);
          continue;
        }

        const elapsedWallTime = (now() - startWallTime) / 1000;
        const delay = elapsedStreamTime - elapsedWallTime;

        if (delay > 0) {
          await sleep(delay);
          if (stop) return;
        }

        setTime(event[0]);
        feed(event[2]);
        prevElapsedStreamTime = elapsedStreamTime;
      }
    }
  }, 0);

  return {
    pushEvent(event) {
      if (event[1] != 'o') return;
      queue.push(event);
    },

    pushText(text) {
      const time = (now() - startWallTime) / 1000;
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
    setTimeout(resolve, t * 1000);
  });
}

export default getBuffer;
