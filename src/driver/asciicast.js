// TODO rename to file driver
// TODO support ttyrec (via opts.format == 'ttyrec')

import Stream from '../stream';
import { parseNpt } from '../util';


function asciicast({ url }, { feed, now, setTimeout, onFinish }, { idleTimeLimit }) {
  let cols;
  let rows;
  let frames;
  let duration;
  let timeoutId;
  let nextFrameIndex = 0;
  let elapsedVirtualTime = 0;
  let startTime;
  let pauseElapsedTime;

  async function load() {
    if (!frames) {
      const res = await fetch(url);
      const asciicast = parseAsciicast(await res.text());
      cols = asciicast.cols;
      rows = asciicast.rows;
      frames = prepareFrames(asciicast.frames, idleTimeLimit ?? asciicast.idleTimeLimit);
      duration = frames[frames.length - 1][0];
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
      timeoutId = null;
      pauseElapsedTime = duration * 1000;
      onFinish();
    }
  }

  function runFrame() {
    let frame = frames[nextFrameIndex];
    let elapsedWallTime;

    do {
      feed(frame[2], frame[1]);
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

    if (typeof where === 'number') {
      where = Math.min(1, where / duration);
    } else if (where === '<<') {
      where = Math.max(0, ((pauseElapsedTime ?? 0) / (duration * 1000)) - 0.1);
    } else if (where === '>>') {
      where = Math.min(1, ((pauseElapsedTime ?? 0) / (duration * 1000)) + 0.1);
    } else if (typeof where === 'string') {
      if (where[where.length - 1] === '%') {
        where = parseFloat(where.substring(0, where.length - 1)) / 100;
      } else {
        where = Math.min(1, parseNpt(where) / duration);
      }
    }

    const targetTime = duration * where * 1000;

    if (targetTime < elapsedVirtualTime) {
      feed('\x1bc'); // reset terminal
      feed('\x1bc', 'i'); // reset subtitles
      nextFrameIndex = 0;
      elapsedVirtualTime = 0;
    }

    let frame = frames[nextFrameIndex];

    while (frame && (frame[0] * 1000 < targetTime)) {
      elapsedVirtualTime = frame[0] * 1000;
      feed(frame[2], frame[1], elapsedVirtualTime);
      frame = frames[++nextFrameIndex];
    }

    pauseElapsedTime = targetTime;

    if (isPlaying) {
      resume();
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

    start: async startAt => {
      await load();
      seek(startAt ?? 0);
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

    seek: where => {
      return seek(where);
    },

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

function parseAsciicast(json) {
  try {
    return parseAsciicastV2(json);
  } catch (_error) {
    // not a v2 format - let's try parsing as v1
    return parseAsciicastV1(json);
  }
}

function parseAsciicastV1(json) {
  const asciicast = JSON.parse(json);
  let time = 0;

  const frames = new Stream(asciicast.stdout).map(e => {
    time += e[0];
    return [time, e[1]];
  });

  return {
    cols: asciicast.width,
    rows: asciicast.height,
    frames: frames
  }
}

function parseAsciicastV2(jsonl) {
  const lines = jsonl.split('\n');
  const header = JSON.parse(lines[0]);

  if (header.version !== 2) {
    throw 'not asciicast v2 format';
  }

  const frames = new Stream(lines)
    .drop(1)
    .filter(l => l[0] === '[')
    .map(l => JSON.parse(l))

  return {
    cols: header.width,
    rows: header.height,
    idleTimeLimit: header.idle_time_limit,
    frames: frames
  }
}

function prepareFrames(frames, idleTimeLimit) {
  return Array.from(limitFrames(batchFrames(frames), idleTimeLimit));
}

function batchFrames(frames) {
  const maxFrameTime = 1.0 / 60;
  let prevFrame;

  return frames.transform(emit => {
    let ic = 0;
    let oc = 0;

    return {
      step: frame => {
        ic++;

        if (prevFrame === undefined) {
          if (frame[1] == 'o') {
            prevFrame = frame;
          } else {
            emit(frame);
          }
          return;
        }

        if ((frame[1] == "o") && (frame[0] - prevFrame[0] < maxFrameTime)) {
          prevFrame[2] += frame[2];
        } else {
          emit(prevFrame);
          oc++;
          if (frame[1] == "o") {
            prevFrame = frame;
          } else {
            prevFrame = undefined;
            emit(frame)
          }
        }
      },

      flush: () => {
        if (prevFrame !== undefined) {
          emit(prevFrame);
          oc++;
        }

        console.debug(`batched ${ic} frames to ${oc} frames`);
      }
    }
  });
}

function limitFrames(frames, idleTimeLimit = Infinity) {
  let prevT = 0;
  let shift = 0;

  return frames.map(e => {
    const delay = e[0] - prevT;
    const cappedDelay = Math.min(delay, idleTimeLimit);
    shift += (delay - cappedDelay);
    prevT = e[0];

    return [e[0] - shift, e[1], e[2]];
  });
}

export { asciicast };
