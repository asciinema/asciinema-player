function getBuffer(bufferTime, dispatch, setTime, baseStreamTime, minFrameTime, logger) {
  const execute = executeEvent(dispatch);

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

function executeEvent(dispatch) {
  return function(code, data) {
    if (code === "o") {
      dispatch("output", data);
    } else if (code === "i") {
      dispatch("input", { data });
    } else if (code === "r") {
      dispatch("resize", data);
    } else if (code === "m") {
      dispatch("marker", data);
    }
  }
}

function buffer(getBufferTime, execute, setTime, logger, baseStreamTime, minFrameTime = 1.0 / 60) {
  const outputBatchWindow = minFrameTime * 1000;
  let epoch = performance.now() - baseStreamTime * 1000;
  let bufferTime = getBufferTime(0);
  let queue = [];
  let onPush;
  let prevElapsedStreamTime = -outputBatchWindow;
  let stop = false;

  function elapsedWallTime() {
    return performance.now() - epoch;
  }

  function push(item) {
    queue.push(item);

    if (onPush !== undefined) {
      onPush(popAll());
      onPush = undefined;
    }
  }

  function popAll() {
    if (queue.length > 0) {
      const items = queue;
      queue = [];
      return items;
    } else {
      return new Promise((resolve) => {
        onPush = resolve;
      });
    }
  }

  async function run() {
    while (!stop) {
      const events = await popAll();
      if (stop) return;

      let nextEventIndex = 0;

      while (nextEventIndex < events.length) {
        nextEventIndex = await executeNextEventChunk(events, nextEventIndex);
      }
    }
  }

  queueMicrotask(run);

  async function executeNextEventChunk(events, nextEventIndex) {
    const event = events[nextEventIndex];
    const elapsedStreamTime = event[3];

    if (elapsedStreamTime - prevElapsedStreamTime >= outputBatchWindow) {
      const delay = elapsedStreamTime - elapsedWallTime();

      if (delay > 0) {
        await sleep(delay);

        if (stop) {
          return events.length;
        }
      }

      setTime(event[0]);
      prevElapsedStreamTime = elapsedStreamTime;
    }

    if (event[1] === "o") {
      return executeOutputGroup(events, nextEventIndex);
    }

    execute(event[1], event[2]);

    return nextEventIndex + 1;
  }

  function executeOutputGroup(events, nextEventIndex) {
    const firstEvent = events[nextEventIndex];
    const batchDeadline = firstEvent[0] * 1000 + outputBatchWindow;
    const output = [];
    let event = firstEvent;

    while (event !== undefined && event[1] === "o" && event[0] * 1000 < batchDeadline) {
      output.push(event[2]);
      event = events[++nextEventIndex];
    }

    execute("o", output);

    return nextEventIndex;
  }

  return {
    pushEvent(event) {
      let latency = elapsedWallTime() - event[0] * 1000;

      if (latency < 0) {
        logger.debug(`correcting epoch by ${latency} ms`);
        epoch += latency;
        latency = 0;
      }

      bufferTime = getBufferTime(latency);
      push([event[0], event[1], event[2], event[0] * 1000 + bufferTime]);
    },

    pushText(text) {
      const time = elapsedWallTime() / 1000;
      push([time, "o", text, time * 1000 + bufferTime]);
    },

    stop() {
      stop = true;

      if (onPush !== undefined) {
        onPush([]);
        onPush = undefined;
      }
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
