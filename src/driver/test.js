function test(kind, width, height, speed, feed, _onFinish) {
  if (kind == 'random') {
    return random(width, height, speed, feed);
  } else if (kind == 'clock') {
    return clock(width, height, speed, feed);
  }
}

function random(width, height, speed, feed) {
  const t = 33 / (speed || 1.0);
  let intervalId;

  return {
    width: width || 80,
    height: height || 24,

    start: () => {
      intervalId = setInterval(() => {
        feed(Math.random().toString());
      }, t);
    },

    stop: () => {
      clearInterval(intervalId);
    }
  };
}

function clock(width, height, _speed, feed, _onFinish) {
  width = width || 5;
  height = height || 1;
  const middleRow = Math.floor(height / 2);
  const leftPad = Math.floor(width / 2) - 2;
  let intervalId;

  return {
    width: width,
    height: height,
    duration: 24 * 60,

    start: () => {
      setTimeout(() => {
        feed(`\x1b[?25l\x1b[1m\x1b[${middleRow}B`);
      }, 0);

      intervalId = setInterval(() => {
        const d = new Date();
        const h = d.getHours();
        const m = d.getMinutes();

        feed('\r');
        for (let i = 0; i < leftPad; i++) { feed(' ') }
        feed('\x1b[32m');
        if (h < 10) { feed('0') }
        feed(`${h}`);
        feed('\x1b[39;5m:\x1b[25;35m')
        if (m < 10) { feed('0') }
        feed(`${m}`);
      }, 1000);
    },

    stop: () => {
      clearInterval(intervalId);
    },

    getCurrentTime: () => {
      const d = new Date();

      return d.getHours() * 60 + d.getMinutes();
    }
  };
}

export { test };
