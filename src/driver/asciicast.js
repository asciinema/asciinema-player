// TODO rename to file driver
// TODO support ttyrec (via opts.format == 'ttyrec')

function asciicast(url, { feed, now, setTimeout, onFinish }) {
  let cols;
  let rows;
  let frames;
  let duration;
  let timeoutId;
  let isFinished;
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
      frames = asciicast.frames;
      duration = asciicast.duration;
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
      isFinished = true;
      pauseElapsedTime = duration * 1000;
      onFinish();
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

    if (where === '<<') {
      where = Math.max(0, ((pauseElapsedTime ?? 0) / (duration * 1000)) - 0.1);
    } else if (where === '>>') {
      where = Math.min(1, ((pauseElapsedTime ?? 0) / (duration * 1000)) + 0.1);
    }

    const targetTime = duration * where * 1000;

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
    isFinished = false;

    if (isPlaying) {
      resume();
    }
  }

  return {
    init: async () => {
      await load();

      return { cols, rows, duration };
    },

    start: async () => {
      await load();
      seek(0);
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
        if (isFinished) {
          seek(0);
        }

        resume();

        return true;
      }
    },

    seek: where => {
      return seek(where);
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
  let duration = 0;

  frames = asciicast.stdout.map(e => {
    duration += e[0];
    return [duration, e[1]];
  });

  return {
    cols: asciicast.width,
    rows: asciicast.height,
    duration: duration,
    frames: frames
  }
}

function parseAsciicastV2(jsonl) {
  const lines = jsonl.split('\n');
  const header = JSON.parse(lines[0]);

  if (header.version !== 2) {
    throw 'not an asciicast v2 format';
  }

  const frames = lines
    .slice(1)
    .filter(l => l[0] === '[')
    .map(l => JSON.parse(l))
    .filter(e => e[1] === 'o')
    .map(e => [e[0], e[2]]);

  return {
    cols: header.width,
    rows: header.height,
    duration: frames[frames.length - 1][0],
    frames: frames
  }
}

export { asciicast };
