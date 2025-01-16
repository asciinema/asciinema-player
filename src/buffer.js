import Queue from "./queue";

function getBuffer(bufferTime, feed, resize, setTime, baseStreamTime, minFrameTime, logger) {
  const execute = executeEvent(feed, resize);

  if (bufferTime === 0) {
    logger.debug("using no buffer");
    return nullBuffer(execute);
  } else {
    bufferTime = bufferTime ?? {};
    let getBufferTime;

    if (typeof bufferTime === "number") {
      logger.debug(`using fixed time buffer (${bufferTime} ms)`);
      getBufferTime = (_latency) => bufferTime;
    } else if (typeof bufferTime === "function") {
      logger.debug("using custom dynamic buffer");
      getBufferTime = bufferTime({ logger });
    } else {
      logger.debug("using adaptive buffer", bufferTime);
      getBufferTime = adaptiveBufferTimeProvider({ logger }, bufferTime);
    }

    return buffer(getBufferTime, execute, setTime, logger, baseStreamTime ?? 0.0, minFrameTime);
  }
}

function nullBuffer(execute) {
  return {
    pushEvent(event) {
      execute(event[1], event[2]);
    },

    pushText(text) {
      execute("o", text);
    },

    stop() {},
  };
}

function executeEvent(feed, resize) {
  return function(code, data) {
    if (code === "o") {
      feed(data);
    } else if (code === "r") {
      const [cols, rows] = data.split("x");
      resize(cols, rows);
    } else if (code === "x" && typeof data === "function") {
      data();
    }
  }
}

function buffer(getBufferTime, execute, setTime, logger, baseStreamTime, minFrameTime = 1.0 / 60) {
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
          execute(event[1], event[2]);
          continue;
        }

        const delay = elapsedStreamTime - elapsedWallTime();

        if (delay > 0) {
          await sleep(delay);
          if (stop) return;
        }

        setTime(event[0]);
        execute(event[1], event[2]);
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
      queue.push(event);
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

function adaptiveBufferTimeProvider({ logger }, { minTime = 25, maxLevel = 100, interval = 50, windowSize = 20, smoothingFactor = 0.2, minImprovementDuration = 1000 }) {
  let bufferLevel = 0;
  let bufferTime = calcBufferTime(bufferLevel);
  let latencies = [];
  let maxJitter = 0;
  let jitterRange = 0;
  let improvementTs = null;

  function calcBufferTime(level) {
    if (level === 0) {
      return minTime;
    } else {
      return interval * level;
    }
  }

  return (latency) => {
    latencies.push(latency);

    if (latencies.length < windowSize) {
      return bufferTime;
    };

    latencies = latencies.slice(-windowSize);
    const currentMinJitter = min(latencies);
    const currentMaxJitter = max(latencies);
    const currentJitterRange = currentMaxJitter - currentMinJitter;
    maxJitter = currentMaxJitter * smoothingFactor + maxJitter * (1 - smoothingFactor);
    jitterRange = currentJitterRange * smoothingFactor + jitterRange * (1 - smoothingFactor);
    const minBufferTime = maxJitter + jitterRange;

    if (latency > bufferTime) {
      logger.debug('buffer underrun', { latency, maxJitter, jitterRange, bufferTime });
    }

    if (bufferLevel < maxLevel && minBufferTime > bufferTime) {
        bufferTime = calcBufferTime((bufferLevel += 1));
        logger.debug(`jitter increased, raising bufferTime`, { latency, maxJitter, jitterRange, bufferTime });
    } else if (
      (bufferLevel > 1 && minBufferTime < calcBufferTime(bufferLevel - 2)) ||
      (bufferLevel == 1 && minBufferTime < calcBufferTime(bufferLevel - 1))
    ) {
      if (improvementTs === null) {
        improvementTs = performance.now();
      } else if (performance.now() - improvementTs > minImprovementDuration) {
        improvementTs = performance.now();
        bufferTime = calcBufferTime((bufferLevel -= 1));
        logger.debug(`jitter decreased, lowering bufferTime`, { latency, maxJitter, jitterRange, bufferTime });
      }

      return bufferTime;
    }

    improvementTs = null;

    return bufferTime;
  };
}

function min(numbers) {
  return numbers.reduce((prev, cur) => cur < prev ? cur : prev);
}

function max(numbers) {
  return numbers.reduce((prev, cur) => cur > prev ? cur : prev);
}

export default getBuffer;
