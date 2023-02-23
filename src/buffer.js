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
  const events = new Queue();
  let startTime;
  let stop = false;

  const stopFeeding = events.forEach(async event => {
    const elapsedWallTime = now() - startTime;
    const elapsedStreamTime = (event[0] + bufferTime) * 1000;

    if (elapsedStreamTime > elapsedWallTime) {
      await sleep(elapsedStreamTime - elapsedWallTime);
    }

    if (stop) return;
    feed(event[2]);
  });

  return {
    pushEvent(event) {
      if (startTime === undefined) {
        startTime = now();
      }

      if (event[1] != 'o') return;

      events.push(event);
    },

    pushText(text) {
      if (startTime === undefined) {
        startTime = now();
      }

      const time = (now() - startTime) / 1000;
      events.push([time, 'o', text]);
    },

    stop() {
      stop = true;
      stopFeeding();
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
