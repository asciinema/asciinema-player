// TODO rename to file driver
// TODO support ttyrec (via opts.format == 'ttyrec')

function asciicast(url, { feed, now, setTimeout, onFinish }, { cols, rows }) {
  let frames;
  let timeoutId;
  let isFinished;
  let nextFrameIndex = 0;
  let virtualElapsedTime = 0;
  let startedTime;
  let lastFrameTime;

  function scheduleNextFrame() {
    const nextFrame = frames[nextFrameIndex];

    if (nextFrame) {
      const delay = nextFrame[0] * 1000;
      const actualElapsedTime = now() - startedTime;
      let timeout = (virtualElapsedTime + delay) - actualElapsedTime;

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
    let actualElapsedTime;

    do {
      feed(frame[1]);
      virtualElapsedTime += (frame[0] * 1000);
      nextFrameIndex++;
      frame = frames[nextFrameIndex];
      actualElapsedTime = now() - startedTime;
    } while (frame && (actualElapsedTime > (virtualElapsedTime + frame[0] * 1000)));

    scheduleNextFrame();
  }

  function start() {
    nextFrameIndex = 0;
    virtualElapsedTime = 0;
    startedTime = now();
    lastFrameTime = startedTime;
    isFinished = false;
    scheduleNextFrame();
  }

  return {
    // preload: () => {
    //   return new Promise(w,h);
    // },

    start: async () => {
      const res = await fetch(url);
      const asciicast = await res.json();
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
        clearTimeout(timeoutId);
        timeoutId = null;
        return false;
      } else {
        if (isFinished) {
          feed('\x1bc'); // reset terminal
          start();
        } else {
          scheduleNextFrame();
        }

        return true;
      }
    },

    // seek: (pos) => {
    //   return seekTime;
    // },

    getCurrentTime: () => {
      if (startedTime) {
        return (now() - startedTime) / 1000;
      }
    }
  }
}

export { asciicast };
