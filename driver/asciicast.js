// TODO rename to file driver
// TODO support ttyrec (via opts.format == 'ttyrec')


function asciicast(url, w, h, speed, feed, _onFinish) {
  let timeoutId;
  let frames;
  let nextFrameIndex = 0;
  let virtualElapsedTime = 0;
  let startedTime;
  let lastFrameTime;

  function scheduleNextFrame() {
    const nextFrame = frames[nextFrameIndex];

    if (nextFrame) {
      const delay = nextFrame[0] * 1000;
      const actualElapsedTime = (new Date()).getTime() - startedTime;
      let timeout = (virtualElapsedTime + delay) - actualElapsedTime;

      if (timeout < 0) {
        timeout = 0;
      }

      timeoutId = setTimeout(runFrame, timeout);
    } else {
      console.log('finished');
      // onFinish();
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
      actualElapsedTime = (new Date()).getTime() - startedTime;
    } while (frame && (actualElapsedTime > (virtualElapsedTime + frame[0] * 1000)));

    scheduleNextFrame();
  }

  return {
    // preload: () => {
    //   return new Promise(w,h);
    // },

    start: () => {
      return fetch(url)
      .then(res => res.json())
      .then(asciicast => {
        frames = asciicast['stdout'];

        startedTime = (new Date()).getTime();
        lastFrameTime = startedTime;
        scheduleNextFrame();

        return {
          width: w || asciicast['width'],
          height: h || asciicast['height'],
          // duration: ...
        };
      })
    },

    stop: () => {
      clearTimeout(timeoutId);
    },

    // togglePlayback: () => {
    //   return stopTime; // when stopped, otherwise no return
    // },

    // seek: (pos) => {
    //   return seekTime;
    // },

    getCurrentTime: () => {
      return 10.0;
    }
  }
}

export { asciicast };
