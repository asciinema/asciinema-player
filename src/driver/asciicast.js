// TODO rename to file driver
// TODO support ttyrec (via opts.format == 'ttyrec')

function asciicast(url, { feed, now, setTimeout, onFinish }) {
  let frames;
  let duration;
  let timeoutId;
  let isFinished;
  let nextFrameIndex = 0;
  let elapsedVirtualTime = 0;
  let startTime;
  let pauseElapsedTime;
  let meta;

  async function load() {
    if (!frames) {
      const res = await fetch(url);
      const asciicast = parseAsciicast(await res.text());
      duration = asciicast.duration;
      frames = asciicast.frames;

      meta = {
        cols: asciicast.cols,
        rows: asciicast.rows,
        duration: duration
      };
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

      return meta;
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

function parseAsciicast(text) {
  const lines = text.split('\n');
  let header;

  try {
    header = JSON.parse(lines[0]);

    if (header.version === 1) {
      header = undefined;
    }
  } catch (_error) {
    // not v2 format, we'll try parsing as v1 below
  }

  if (header) {
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
  } else {
    const asciicast = JSON.parse(text);
    let duration = 0;

    const frames = asciicast.stdout.map(e => {
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
}

export { asciicast };
