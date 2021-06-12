// TODO rename to file driver
// TODO support ttyrec (via opts.format == 'ttyrec')

function asciicast(url, { feed, now, setTimeout, onFinish }, { cols, rows }) {
  let frames;
  let duration;
  let timeoutId;
  let isFinished;
  let nextFrameIndex = 0;
  let elapsedVirtualTime = 0;
  let startTime;
  let pauseElapsedTime;
  let recording;

  function load() {
    if (!recording) {
      recording = fetch(url).then(res => res.json());
    }

    return recording;
  }

  function scheduleNextFrame() {
    const nextFrame = frames[nextFrameIndex];

    if (nextFrame) {
      const delay = nextFrame[0] * 1000;
      const elapsedWallTime = now() - startTime;
      let timeout = elapsedVirtualTime + delay - elapsedWallTime;

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
      elapsedVirtualTime += (frame[0] * 1000);
      nextFrameIndex++;
      frame = frames[nextFrameIndex];
      elapsedWallTime = now() - startTime;
    } while (frame && (elapsedWallTime > (elapsedVirtualTime + frame[0] * 1000)));

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
    // TODO make it async so it can fetch if needed (when seek called before start)
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

    while (frame && (elapsedVirtualTime + (frame[0] * 1000) < targetTime)) {
      feed(frame[1]);
      elapsedVirtualTime += frame[0] * 1000;
      nextFrameIndex++;
      frame = frames[nextFrameIndex];
    }

    pauseElapsedTime = targetTime;
    isFinished = false;

    if (isPlaying) {
      resume();
    }
  }

  return {
    preload: async () => {
      const asciicast = await load();

      return {
        cols: cols || asciicast['width'],
        rows: rows || asciicast['height'],
        duration: asciicast['duration']
      };
    },

    start: async () => {
      const asciicast = await load();
      frames = asciicast['stdout'];
      duration = asciicast['duration'];

      seek(0);
      resume();

      return {
        cols: cols || asciicast['width'],
        rows: rows || asciicast['height'],
        duration: asciicast['duration']
      };
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

export { asciicast };
