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

  function start() {
    nextFrameIndex = 0;
    elapsedVirtualTime = 0;
    startTime = now();
    isFinished = false;
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
      start();

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
          feed('\x1bc'); // reset terminal
          start();
        } else {
          resume();
        }

        return true;
      }
    },

    // seek: (pos) => {
    //   return seekTime;
    // },

    getCurrentTime: () => {
      if (isFinished) {
        return duration;
      } else if (timeoutId) {
        return (now() - startTime) / 1000;
      } else {
        return (pauseElapsedTime ?? 0) / 1000;
      }
    }
  }
}

export { asciicast };
