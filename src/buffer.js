import Queue from "./queue";

function getBuffer(bufferTime, feed, resize, onInput, onMarker, setTime, baseStreamTime, minFrameTime, logger) {
  const execute = executeEvent(feed, resize, onInput, onMarker);

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

    stop() { },
  };
}

function executeEvent(feed, resize, onInput, onMarker) {
  return function(code, data) {
    if (code === "o") {
      feed(data);
    } else if (code === "i") {
      onInput(data);
    } else if (code === "r") {
      resize(data.cols, data.rows);
    } else if (code === "m") {
      onMarker(data);
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
      queue.push([elapsedWallTime() / 1000, "o", text]);
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

function adaptiveBufferTimeProvider(
  { logger } = {},
  {
    minBufferTime = 50,
    bufferLevelStep = 100,
    maxBufferLevel = 50,
    transitionDuration = 500,
    peakHalfLifeUp = 100,
    peakHalfLifeDown = 10000,
    floorHalfLifeUp = 5000,
    floorHalfLifeDown = 100,
    idealHalfLifeUp = 1000,
    idealHalfLifeDown = 5000,
    safetyMultiplier = 1.2,
    minImprovementDuration = 3000,
  } = {}
) {
  function levelToMs(level) {
    return level === 0 ? minBufferTime : bufferLevelStep * level;
  }

  let bufferLevel = 1;
  let bufferTime = levelToMs(bufferLevel);
  let lastUpdateTime = performance.now();
  let smoothedPeakLatency = null;
  let smoothedFloorLatency = null;
  let smoothedIdealBufferTime = null;
  let stableSince = null;
  let targetBufferTime = null;
  let transitionRate = null;

  return function(latency) {
    const now = performance.now();
    const dt = Math.max(0, now - lastUpdateTime);
    lastUpdateTime = now;

    // adjust EMA-smoothed peak latency from current latency

    if (smoothedPeakLatency === null) {
      smoothedPeakLatency = latency;
    } else if (latency > smoothedPeakLatency) {
      const alphaUp = 1 - Math.pow(2, -dt / peakHalfLifeUp);
      smoothedPeakLatency += alphaUp * (latency - smoothedPeakLatency);
    } else {
      const alphaDown = 1 - Math.pow(2, -dt / peakHalfLifeDown);
      smoothedPeakLatency += alphaDown * (latency - smoothedPeakLatency);
    }

    smoothedPeakLatency = Math.max(smoothedPeakLatency, 0);

    // adjust EMA-smoothed floor latency from current latency

    if (smoothedFloorLatency === null) {
      smoothedFloorLatency = latency;
    } else if (latency > smoothedFloorLatency) {
      const alphaUp = 1 - Math.pow(2, -dt / floorHalfLifeUp);
      smoothedFloorLatency += alphaUp * (latency - smoothedFloorLatency);
    } else {
      const alphaDown = 1 - Math.pow(2, -dt / floorHalfLifeDown);
      smoothedFloorLatency += alphaDown * (latency - smoothedFloorLatency);
    }

    smoothedFloorLatency = Math.max(smoothedFloorLatency, 0);

    // adjust EMA-smoothed ideal buffer time

    const jitter = smoothedPeakLatency - smoothedFloorLatency;
    const idealBufferTime = safetyMultiplier * (smoothedPeakLatency + jitter);

    if (smoothedIdealBufferTime === null) {
      smoothedIdealBufferTime = idealBufferTime;
    } else if (idealBufferTime > smoothedIdealBufferTime) {
      const alphaUp = 1 - Math.pow(2, -dt / idealHalfLifeUp);
      smoothedIdealBufferTime += + alphaUp * (idealBufferTime - smoothedIdealBufferTime);
    } else {
      const alphaDown = 1 - Math.pow(2, -dt / idealHalfLifeDown);
      smoothedIdealBufferTime += + alphaDown * (idealBufferTime - smoothedIdealBufferTime);
    }

    // quantize smoothed ideal buffer time to discrete buffer level

    let newBufferLevel;

    if (smoothedIdealBufferTime <= minBufferTime) {
      newBufferLevel = 0;
    } else {
      newBufferLevel = clamp(Math.ceil(smoothedIdealBufferTime / bufferLevelStep), 1, maxBufferLevel);
    }

    if (latency > bufferTime) {
      logger.debug('buffer underrun', { latency, bufferTime });
    }

    // adjust buffer level and target buffer time for new buffer level

    if (newBufferLevel > bufferLevel) {
      if (latency > bufferTime) { // <- underrun - raise quickly
        bufferLevel = Math.min(newBufferLevel, bufferLevel + 3);
      } else {
        bufferLevel += 1;
      }

      targetBufferTime = levelToMs(bufferLevel);
      transitionRate = (targetBufferTime - bufferTime) / transitionDuration;
      stableSince = null;
      logger.debug('raising buffer', { latency, bufferTime, targetBufferTime });
    } else if (newBufferLevel < bufferLevel) {
      if (stableSince == null) stableSince = now;

      if (now - stableSince >= minImprovementDuration) {
        bufferLevel -= 1;
        targetBufferTime = levelToMs(bufferLevel);
        transitionRate = (targetBufferTime - bufferTime) / transitionDuration;
        stableSince = now;
        logger.debug('lowering buffer', { latency, bufferTime, targetBufferTime });
      }
    } else {
      stableSince = null;
    }

    // linear transition to target buffer time

    if (targetBufferTime !== null) {
      bufferTime += transitionRate * dt;

      if (transitionRate >= 0 && bufferTime > targetBufferTime || transitionRate < 0 && bufferTime < targetBufferTime) {
        bufferTime = targetBufferTime;
        targetBufferTime = null;
      }
    }

    return bufferTime;
  };
}

function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }

export default getBuffer;
