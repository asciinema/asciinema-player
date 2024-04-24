import Queue from "./queue";

function getBuffer(bufferTime, feed, setTime, baseStreamTime, minFrameTime, logger) {
  if (bufferTime === 0) {
    logger.debug("using no buffer");
    return nullBuffer(feed);
  } else {
    let getBufferTime;

    if (typeof bufferTime === "number") {
      logger.debug(`using fixed time buffer (${bufferTime} ms)`);
      getBufferTime = (_latency) => bufferTime;
    } else if (typeof bufferTime === "function") {
      logger.debug("using custom dynamic buffer");
      getBufferTime = bufferTime({ logger });
    } else {
      logger.debug("using adaptive buffer");
      getBufferTime = adaptiveBufferTimeProvider({ logger });
    }

    return buffer(getBufferTime, feed, setTime, logger, baseStreamTime ?? 0.0, minFrameTime);
  }
}

function nullBuffer(feed) {
  return {
    pushEvent(event) {
      if (event[1] === "o") {
        feed(event[2]);
      } else if (event[1] === "r") {
        const [cols, rows] = event[2].split("x");
        feed(`\x1b[8;${rows};${cols};t`);
      }
    },

    pushText(text) {
      feed(text);
    },

    stop() {},
  };
}

function buffer(getBufferTime, feed, setTime, logger, baseStreamTime, minFrameTime = 1.0 / 60) {
  let epoch = performance.now() - baseStreamTime * 1000;
  let bufferTime = getBufferTime(0);
  const queue = new Queue();
  minFrameTime *= 1000;
  let prevElapsedStreamTime = -minFrameTime;
  let stop = false;

  function elapsedWallTime() {
    return performance.now() - epoch;
  }

  setTimeout(async () => {
    while (!stop) {
      const events = await queue.popAll();
      if (stop) return;

      for (const event of events) {
        const elapsedStreamTime = event[0] * 1000 + bufferTime;

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
      let latency = elapsedWallTime() - event[0] * 1000;

      if (latency < 0) {
        logger.debug(`correcting epoch by ${latency} ms`);
        epoch += latency;
        latency = 0;
      }

      bufferTime = getBufferTime(latency);

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

const BUFFER_TIME_MULTIPLIER = 1.5;
const INITIAL_BUFFER_TIME = 10;
const MAX_BUFFER_LEVEL = 12;
const LATENCY_WINDOW_SIZE = 10;

function adaptiveBufferTimeProvider({ logger }) {
  let bufferTime = INITIAL_BUFFER_TIME;
  let bufferLevel = 0;
  let latencies = [];

  return (latency) => {
    latencies.push(latency);

    if (latencies.length < LATENCY_WINDOW_SIZE) {
      return bufferTime;
    };

    latencies = latencies.slice(-LATENCY_WINDOW_SIZE);
    const avgLatency = avg(latencies);

    if (bufferLevel < MAX_BUFFER_LEVEL && avgLatency > bufferTime) {
      bufferTime = calcBufferTime((bufferLevel += 1));
      logger.debug(`latency increased, raising bufferTime to ${bufferTime} ms`);
    } else if (
      (bufferLevel == 1 && avgLatency < calcBufferTime(bufferLevel - 1)) ||
      (bufferLevel > 1 && avgLatency < calcBufferTime(bufferLevel - 2))
    ) {
      bufferTime = calcBufferTime((bufferLevel -= 1));
      logger.debug(`latency decreased, lowering bufferTime to ${bufferTime} ms`);
    }

    return bufferTime;
  };
}

function avg(numbers) {
  return numbers.reduce((prev, cur) => prev + cur, 0) / numbers.length;
}

function calcBufferTime(level) {
  return INITIAL_BUFFER_TIME * BUFFER_TIME_MULTIPLIER ** level;
}

export default getBuffer;
