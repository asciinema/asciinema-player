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
      if (event[1] === "o") {
        feed(event[2]);
      }
    },

    pushText(text) {
      feed(text);
    },

    stop() {},
  };
}

function buffer(feed, setTime, bufferTime, baseStreamTime, minFrameTime = 1.0 / 60) {
  let startWallTime = performance.now() - baseStreamTime * 1000;
  const queue = new Queue();
  let stop = false;
  minFrameTime = minFrameTime * 1000;
  let prevElapsedStreamTime = -minFrameTime;

  function elapsedWallTime() {
    return performance.now() - startWallTime;
  }

  setTimeout(async () => {
    while (!stop) {
      const events = await queue.popAll();
      if (stop) return;

      for (const event of events) {
        const elapsedStreamTime = (event[0] + bufferTime) * 1000;

        if (elapsedStreamTime - prevElapsedStreamTime < minFrameTime) {
          feed(event[2]);
          continue;
        }

        const delay = elapsedStreamTime - elapsedWallTime();

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
      if (event[1] === "o") {
        queue.push(event);
      } else if (event[1] === "r") {
        const [cols, rows] = event[2].split("x");
        queue.push([event[0], "o", `\x1b[8;${rows};${cols};t`]);
      }
    },

    pushText(text) {
      queue.push([elapsedWallTime(), "o", text]);
    },

    stop() {
      stop = true;
      queue.push(undefined);
    },
  };
}

function sleep(t) {
  return new Promise((resolve) => {
    setTimeout(resolve, t);
  });
}

export default getBuffer;
