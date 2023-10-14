import Queue from "./queue";

function getBuffer(feed, setTime, bufferTime, baseStreamTime, minFrameTime, idleTimeLimit) {
  if (bufferTime > 0) {
    return buffer(feed, setTime, bufferTime, baseStreamTime ?? 0.0, minFrameTime, idleTimeLimit);
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

function buffer(feed, setTime, bufferTime, baseStreamTime, minFrameTime = 1.0 / 60, idleTimeLimit=Infinity) {
  const queue = new Queue();
  const startWallTime = now();
  let fastForward = 0;
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
        let delay = elapsedStreamTime - (elapsedWallTime + fastForward);
        if (delay > idleTimeLimit) {
          fastForward += delay - idleTimeLimit;
          delay = idleTimeLimit;
        }
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
      if (event[1] === 'o') {
        queue.push(event);
      } else if (event[1] === 'r') {
        const [cols, rows] = event[2].split('x');
        queue.push([event[0], 'o', `\x1b[8;${rows};${cols};t`]);
      }
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
