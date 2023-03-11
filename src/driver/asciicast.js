// TODO rename to file driver
// TODO support ttyrec (via opts.format == 'ttyrec')

import Stream from '../stream';


function asciicast(src, { feed, now, setTimeout, onFinish, logger }, { idleTimeLimit, startAt, loop }) {
  let cols;
  let rows;
  let frames;
  let duration;
  let effectiveStartAt;
  let timeoutId;
  let nextFrameIndex = 0;
  let elapsedVirtualTime = 0;
  let startTime;
  let pauseElapsedTime;
  let playCount = 0;

  async function load() {
    if (frames) return;

    const asciicast = loadAsciicast(await doFetch(src));
    cols = asciicast.cols;
    rows = asciicast.rows;
    idleTimeLimit = idleTimeLimit ?? asciicast.idleTimeLimit
    const result = prepareFrames(asciicast.frames, logger, idleTimeLimit, startAt);
    frames = result.frames;

    if (frames.length === 0) {
      throw 'asciicast is missing events';
    }

    effectiveStartAt = result.effectiveStartAt;
    duration = frames[frames.length - 1][0];
  }

  async function doFetch({ url, data, fetchOpts = {} }) {
    if (url !== undefined) {
      const response = await fetch(url, fetchOpts);

      if (!response.ok) {
        throw `failed fetching asciicast file: ${response.statusText} (${response.status})`;
      }

      return await response.text();
    } else if (data !== undefined) {
      if (typeof data === 'function') {
        data = data();
      }

      return await data;
    } else {
      throw 'failed fetching asciicast file: url/data missing in src';
    }
  }

  function scheduleNextFrame() {
    const nextFrame = frames[nextFrameIndex];

    if (nextFrame) {
      const t = nextFrame[0] * 1000;
      const elapsedWallTime = now() - startTime;
      let timeout = t - elapsedWallTime;

      if (timeout < 0) {
        timeout = 0;
      }

      timeoutId = setTimeout(runFrame, timeout);
    } else {
      playCount++;

      if (loop === true || (typeof loop === 'number' && playCount < loop)) {
        nextFrameIndex = 0;
        startTime = now();
        feed('\x1bc'); // reset terminal
        scheduleNextFrame();
      } else {
        timeoutId = null;
        pauseElapsedTime = duration * 1000;
        onFinish();
      }
    }
  }

  function runFrame() {
    let frame = frames[nextFrameIndex];
    let elapsedWallTime;

    do {
      feed(frame[1]);
      elapsedVirtualTime = frame[0] * 1000;
      frame = frames[++nextFrameIndex];
      elapsedWallTime = now() - startTime;
    } while (frame && (elapsedWallTime > frame[0] * 1000));

    scheduleNextFrame();
  }

  function pause() {
    clearTimeout(timeoutId);
    timeoutId = null;
    pauseElapsedTime = now() - startTime;
  }

  function resume() {
    startTime = now() - pauseElapsedTime;
    pauseElapsedTime = null;
    scheduleNextFrame();
  }

  function seek(where) {
    const isPlaying = !!timeoutId;

    if (isPlaying) {
      pause();
    }

    if (typeof where === 'string') {
      const currentTime = (pauseElapsedTime ?? 0) / 1000;

      if (where === '<<') {
        where = currentTime - 5;
      } else if (where === '>>') {
        where = currentTime + 5;
      } else if (where === '<<<') {
        where = currentTime - (0.1 * duration);
      } else if (where === '>>>') {
        where = currentTime + (0.1 * duration);
      } else if (where[where.length - 1] === '%') {
        where = (parseFloat(where.substring(0, where.length - 1)) / 100) * duration;
      }
    }

    const targetTime = Math.min(Math.max(where, 0), duration) * 1000;

    if (targetTime < elapsedVirtualTime) {
      feed('\x1bc'); // reset terminal
      nextFrameIndex = 0;
      elapsedVirtualTime = 0;
    }

    let frame = frames[nextFrameIndex];

    while (frame && (frame[0] * 1000 < targetTime)) {
      feed(frame[1]);
      elapsedVirtualTime = frame[0] * 1000;
      frame = frames[++nextFrameIndex];
    }

    pauseElapsedTime = targetTime;

    if (isPlaying) {
      resume();
    }

    return true;
  }

  function step() {
      let nextFrame = frames[nextFrameIndex];

      if (nextFrame !== undefined) {
        feed(nextFrame[1]);
        elapsedVirtualTime = nextFrame[0] * 1000;
        pauseElapsedTime = elapsedVirtualTime;
        nextFrameIndex++;
      } else {
        pauseElapsedTime = duration * 1000;
        onFinish();
      }
  }

  function getPoster(time) {
    const posterTime = time * 1000;
    const poster = [];
    let nextFrameIndex = 0;
    let frame = frames[0];

    while (frame && (frame[0] * 1000 < posterTime)) {
      poster.push(frame[1]);
      frame = frames[++nextFrameIndex];
    }

    return poster;
  }

  return {
    init: async () => {
      await load();

      return { cols, rows, duration };
    },

    start: async () => {
      seek(effectiveStartAt);
      resume();
    },

    stop: () => {
      clearTimeout(timeoutId);
    },

    pauseOrResume: () => {
      if (timeoutId) {
        pause();
        return false;
      } else {
        resume();
        return true;
      }
    },

    seek,

    step,

    getPoster: t => {
      return getPoster(t);
    },

    getCurrentTime: () => {
      if (timeoutId) {
        return (now() - startTime) / 1000;
      } else {
        return (pauseElapsedTime ?? 0) / 1000;
      }
    }
  }
}

function loadAsciicast(data) {
  let header;
  let events = new Stream([]);

  if (typeof data === 'string') {
    const result = parseJsonl(data);;

    if (result !== undefined) {
      header = result.header;
      events = result.events;
    } else {
      header = JSON.parse(data);
    }
  } else if (typeof data === 'object' && typeof data.version === 'number') {
    header = data;
  } else if (Array.isArray(data)) {
    header = data[0];
    events = (new Stream(data)).drop(1);
  } else {
    throw 'invalid data';
  }

  if (header.version === 1) {
    return buildAsciicastV1(header);
  } else if (header.version === 2) {
    return buildAsciicastV2(header, events);
  } else {
    throw `asciicast v${header.version} format not supported`;
  }
}

function parseJsonl(jsonl) {
  const lines = jsonl.split('\n');
  let header;

  try {
    header = JSON.parse(lines[0]);
  } catch (_error) {
    return;
  }

  const events = new Stream(lines)
    .drop(1)
    .filter(l => l[0] === '[')
    .map(l => JSON.parse(l));

  return { header, events };
}

function buildAsciicastV1(data) {
  let time = 0;

  const frames = new Stream(data.stdout).map(e => {
    time += e[0];
    return [time, e[1]];
  });

  return {
    cols: data.width,
    rows: data.height,
    frames: frames
  }
}

function buildAsciicastV2(header, events) {
  const frames = events
    .filter(e => e[1] === 'o')
    .map(e => [e[0], e[2]]);

  return {
    cols: header.width,
    rows: header.height,
    idleTimeLimit: header.idle_time_limit,
    frames: frames
  }
}

function batchFrames(frames, logger) {
  const maxFrameTime = 1.0 / 60;
  let prevFrame;

  return frames.transform(emit => {
    let ic = 0;
    let oc = 0;

    return {
      step: frame => {
        ic++;

        if (prevFrame === undefined) {
          prevFrame = frame;
          return;
        }

        if (frame[0] - prevFrame[0] < maxFrameTime) {
          prevFrame[1] += frame[1];
        } else {
          emit(prevFrame);
          prevFrame = frame;
          oc++;
        }
      },

      flush: () => {
        if (prevFrame !== undefined) {
          emit(prevFrame);
          oc++;
        }

        logger.debug(`batched ${ic} frames to ${oc} frames`);
      }
    }
  });
}

function prepareFrames(frames, logger, idleTimeLimit = Infinity, startAt = 0) {
  let prevT = 0;
  let shift = 0;
  let effectiveStartAt = startAt;

  const fs = Array.from(batchFrames(frames, logger).map(e => {
    const delay = e[0] - prevT;
    const delta = delay - idleTimeLimit;
    prevT = e[0];

    if (delta > 0) {
      shift += delta;

      if (e[0] < startAt) {
        effectiveStartAt -= delta;
      }
    }

    return [e[0] - shift, e[1]];
  }));

  return {
    frames: fs,
    effectiveStartAt: effectiveStartAt
  }
}

export { asciicast };
